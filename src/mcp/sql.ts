export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type JsonRpcId = number;

export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | {
      jsonrpc: '2.0';
      id: JsonRpcId;
      result: unknown;
    }
  | {
      jsonrpc: '2.0';
      id: JsonRpcId;
      error: { code: number; message: string; data?: unknown };
    };

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

export type SqlMcpClientOptions = {
  /**
   * Base URL where `mcp/sql.js` is running, e.g. `http://127.0.0.1:7071`.
   * Defaults to `http://127.0.0.1:7071`.
   */
  baseUrl?: string;
  /**
   * Provide a custom fetch implementation (useful for tests).
   * Defaults to the global `fetch`.
   */
  fetchImpl?: typeof fetch;
};

export class SqlMcpClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private abort = new AbortController();
  private connected = false;

  private postUrl: string | null = null;
  private nextId: number = 1;
  private pending = new Map<number, Pending>();

  constructor(options: SqlMcpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:7071').replace(/\/+$/u, '');
    // Avoid "Illegal invocation" in browsers when storing `window.fetch` and later calling it
    // as `this.fetchImpl(...)` (which would bind `this` to the client instance).
    const impl = options.fetchImpl ?? globalThis.fetch;
    this.fetchImpl = ((...args: Parameters<typeof fetch>) => impl(...args)) as typeof fetch;
  }

  /**
   * Opens the SSE stream and waits for the server to provide the POST endpoint
   * (which includes `sessionId`).
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    const sseUrl = new URL('/sse', this.baseUrl).toString();
    const res = await this.fetchImpl(sseUrl, {
      method: 'GET',
      headers: { accept: 'text/event-stream' },
      signal: this.abort.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to connect SSE (${res.status}): ${await safeText(res)}`);
    }
    if (!res.body) throw new Error('SSE response has no body');

    // Parse SSE in the background.
    void this.readSseStream(res.body);

    // Wait for server-provided endpoint.
    const postUrl = await this.waitForPostUrl();
    this.postUrl = postUrl;
    this.connected = true;
  }

  async close(): Promise<void> {
    if (this.abort.signal.aborted) return;
    this.abort.abort();
    this.connected = false;
    this.postUrl = null;
    for (const [, p] of this.pending) {
      p.reject(new Error('MCP client closed'));
    }
    this.pending.clear();
  }

  async listTools(): Promise<unknown> {
    console.log("listTools");
    return await this.request('tools/list', {});
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return await this.request('tools/call', { name, arguments: args });
  }

  async mysqlQuery(sql: string, params?: unknown[]): Promise<unknown> {
    return await this.callTool('mysql_query', params ? { sql, params } : { sql });
  }

  async listTables(): Promise<unknown> {
    return await this.callTool('mysql_list_tables', {});
  }

  async describeTable(table: string): Promise<unknown> {
    return await this.callTool('mysql_describe_table', { table });
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.connected) await this.connect();
    if (!this.postUrl) throw new Error('MCP postUrl not initialized');

    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    const resultPromise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    const postRes = await this.fetchImpl(this.postUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: this.abort.signal,
    });

    if (!postRes.ok) {
      this.pending.delete(id);
      throw new Error(`MCP POST failed (${postRes.status}): ${await safeText(postRes)}`);
    }

    // Response is typically empty (server answers over SSE), but tolerate a JSON response too.
    const ct = postRes.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const body = (await postRes.json()) as unknown;
      const maybeResp = body as Partial<JsonRpcResponse>;
      if (maybeResp && typeof maybeResp === 'object' && 'id' in maybeResp) {
        // If server replied inline, resolve now.
        this.handleJsonRpcResponse(maybeResp as JsonRpcResponse);
      }
    }

    return await resultPromise;
  }

  private async waitForPostUrl(): Promise<string> {
    const deadlineMs = 10_000;
    const start = Date.now();
    while (!this.postUrl && !this.abort.signal.aborted) {
      // postUrl is set by SSE "endpoint" event parsing (see onSseEvent)
      await delay(25);
      if (Date.now() - start > deadlineMs) break;
    }
    if (this.abort.signal.aborted) throw new Error('Connection aborted');
    if (this.postUrl) return this.postUrl;

    throw new Error('Timed out waiting for MCP server endpoint over SSE');
  }

  private async readSseStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (!this.abort.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Process complete SSE events separated by blank line.
        // SSE lines end with \n (sometimes \r\n); we normalize by splitting on \n\n.
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const rawEvent = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const evt = parseSseEvent(rawEvent);
          if (evt) this.onSseEvent(evt);
        }
      }
    } catch (e) {
      if (!this.abort.signal.aborted) {
        for (const [, p] of this.pending) p.reject(e);
        this.pending.clear();
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  }

  private onSseEvent(evt: { event: string; data: string }): void {
    const eventName = evt.event || 'message';
    const data = evt.data ?? '';

    // Many MCP SSE implementations send the POST endpoint as an "endpoint" event.
    // We accept either a plain path or a JSON object.
    if (eventName === 'endpoint') {
      const endpoint = parseEndpointData(data);
      if (endpoint) {
        const url = new URL(endpoint, this.baseUrl);
        // The server expects sessionId query param
        if (!url.searchParams.get('sessionId') && !url.searchParams.get('session_id')) {
          // Some servers send just "/messages" and rely on headers/session cookies; not our case.
          // We'll still store it; requests will fail loudly if sessionId is required.
        }
        this.postUrl = url.toString();
      }
      return;
    }

    // Default message event should be a JSON-RPC response.
    try {
      const parsed = JSON.parse(data) as JsonRpcResponse;
      this.handleJsonRpcResponse(parsed);
    } catch {
      // ignore non-JSON messages
    }
  }

  private handleJsonRpcResponse(resp: JsonRpcResponse): void {
    const id = (resp as { id: number }).id;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);

    if ('error' in resp) {
      pending.reject(new Error(resp.error?.message || 'MCP error'));
      return;
    }
    pending.resolve(resp.result);
  }
}

export async function createSqlMcpClient(options: SqlMcpClientOptions = {}): Promise<SqlMcpClient> {
  const client = new SqlMcpClient(options);
  await client.connect();
  return client;
}

function parseSseEvent(raw: string): { event: string; data: string } | null {
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/\r$/u, ''))
    .filter((l) => !l.startsWith(':')); // comment lines

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
      continue;
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

function parseEndpointData(data: string): string | null {
  const trimmed = data.trim();
  if (!trimmed) return null;

  // JSON shape: { "endpoint": "/messages?sessionId=..." } or similar
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as { endpoint?: string; url?: string; postUrl?: string };
      return obj.endpoint || obj.url || obj.postUrl || null;
    } catch {
      return null;
    }
  }

  // Plain string path/url
  return trimmed;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
