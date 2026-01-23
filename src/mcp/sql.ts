import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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

/**
 * MCP client wrapper for MySQL MCP server using the official MCP SDK.
 * 
 * This replaces the previous custom JSON-RPC implementation with the
 * standardized @modelcontextprotocol/sdk client.
 */
export class SqlMcpClient {
  private baseUrl: string;
  private fetchImpl?: typeof fetch;
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private connected = false;

  constructor(options: SqlMcpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:7071').replace(/\/+$/u, '');
    
    // Store custom fetch implementation if provided
    // Avoid "Illegal invocation" in browsers when storing `window.fetch` and later calling it
    if (options.fetchImpl) {
      const impl = options.fetchImpl;
      this.fetchImpl = ((...args: Parameters<typeof fetch>) => impl(...args)) as typeof fetch;
    }
    
    // Initialize the MCP client
    this.client = new Client(
      { name: 'sql-mcp-client', version: '1.0.0' },
      { capabilities: {} }
    );
  }

  /**
   * Connects to the MCP server using Streamable HTTP transport.
   * This transport is compatible with SSE servers during the migration period.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    // StreamableHTTPClientTransport uses the base URL and handles endpoint discovery
    const serverUrl = new URL(this.baseUrl);
    
    // Create Streamable HTTP transport with optional custom fetch
    const transportOptions: { fetch?: typeof fetch } = {};
    if (this.fetchImpl) {
      transportOptions.fetch = this.fetchImpl;
    }
    
    this.transport = new StreamableHTTPClientTransport(serverUrl, transportOptions);

    // Connect the client to the transport
    await this.transport.start();
    await this.client.connect(this.transport);
    
    this.connected = true;
  }

  async close(): Promise<void> {
    console.log('closing MCP client');
    if (!this.connected) return;
    
    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }
    } catch (e) {
      console.error('Error closing transport:', e);
    }
    
    this.connected = false;
  }

  async listTools(): Promise<unknown> {
    if (!this.connected) await this.connect();
    const result = await this.client.listTools();
    return result;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.connected) await this.connect();
    const result = await this.client.callTool({ name, arguments: args });
    return result;
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
}

export async function createSqlMcpClient(options: SqlMcpClientOptions = {}): Promise<SqlMcpClient> {
  const client = new SqlMcpClient(options);
  await client.connect();
  return client;
}
