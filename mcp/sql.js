'use strict';

/**
 * MySQL MCP server (HTTP/SSE)
 *
 * - Transport: HTTP + Server-Sent Events (SSE)
 * - Tooling: exposes a read-only `mysql_query` tool
 *
 * Env:
 * - MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 * - MCP_HOST (default 127.0.0.1)
 * - MCP_PORT (default 7071)
 * - MCP_MAX_ROWS (default 1000)
 */

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function formatCellValue(value) {
  if (value === null) return 'NULL';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? value.toISOString() : String(value);
  }
  // mysql2 can return Buffers for BLOB/BINARY columns
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    const maxBytes = 32;
    const preview = value.subarray(0, maxBytes).toString('hex');
    const suffix = value.length > maxBytes ? '…' : '';
    return `<Buffer len=${value.length} hex=${preview}${suffix}>`;
  }
  try {
    return JSON.stringify(
      value,
      (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      0
    );
  } catch {
    return String(value);
  }
}

function rowsToStructuredPlainText(rows) {
  if (!Array.isArray(rows)) return formatCellValue(rows);
  if (rows.length === 0) return 'Row count: 0\nRows: (none)';

  /** @type {string[]} */
  const columns = [];
  const seen = new Set();

  // Derive a stable column order from the first handful of rows.
  for (const r of rows.slice(0, 50)) {
    if (r && typeof r === 'object') {
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) {
          seen.add(k);
          columns.push(k);
        }
      }
    }
  }

  const lines = [];
  lines.push(`Row count: ${rows.length}`);
  if (columns.length) lines.push(`Columns: ${columns.join(', ')}`);
  lines.push('Rows:');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    lines.push(`- Row ${i + 1}:`);
    if (!row || typeof row !== 'object') {
      lines.push(`  value: ${formatCellValue(row)}`);
      continue;
    }

    const keys = columns.length ? columns : Object.keys(row);
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(row, k)) {
        lines.push(`  ${k}: ${formatCellValue(row[k])}`);
      }
    }
  }

  return lines.join('\n');
}

function escapeIdent(name) {
  return String(name).replace(/`/g, '``');
}

function isSqlBareDefaultToken(s) {
  const v = String(s).trim();
  if (!v) return false;
  // Common bare defaults / functions in MySQL.
  if (/^(NULL|CURRENT_TIMESTAMP(?:\(\d+\))?)$/iu.test(v)) return true;
  if (/^(NOW|UUID|UUID_TO_BIN|BIN_TO_UUID|CURRENT_DATE|CURRENT_TIME|LOCALTIME|LOCALTIMESTAMP)(\(\))?$/iu.test(v)) {
    return true;
  }
  // Numeric literal
  if (/^-?\d+(\.\d+)?$/u.test(v)) return true;
  // Hex literal (0x...)
  if (/^0x[0-9a-f]+$/iu.test(v)) return true;
  return false;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  const s = String(value);
  if (isSqlBareDefaultToken(s)) return s.trim();
  // Quote as string literal
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function createTableSqlFromDescribeRows(table, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `-- No columns found for table ${sqlLiteral(table)}\nCREATE TABLE \`${escapeIdent(
      table
    )}\` (\n  -- (no columns)\n);`;
  }

  // Expect rows like:
  // { columnName, columnType, isNullable, columnDefault, columnKey, extra, ordinalPosition }
  const cols = [...rows].sort(
    (a, b) => Number(a?.ordinalPosition ?? 0) - Number(b?.ordinalPosition ?? 0)
  );

  /** @type {string[]} */
  const columnLines = [];
  /** @type {string[]} */
  const pkCols = [];
  /** @type {string[]} */
  const uniqueCols = [];
  /** @type {string[]} */
  const indexCols = [];

  for (const r of cols) {
    const colName = r?.columnName;
    const colType = r?.columnType;
    const isNullable = String(r?.isNullable ?? '').toUpperCase() === 'YES';
    const colDefault = r?.columnDefault;
    const colKey = String(r?.columnKey ?? '').toUpperCase(); // PRI | UNI | MUL | ''
    const extra = String(r?.extra ?? '');

    const parts = [];
    parts.push(`\`${escapeIdent(colName)}\``);
    parts.push(String(colType || '').trim() || 'TEXT');
    parts.push(isNullable ? 'NULL' : 'NOT NULL');

    // MySQL often has implicit DEFAULT NULL when nullable; only emit default when present.
    if (colDefault !== null && colDefault !== undefined) {
      parts.push(`DEFAULT ${sqlLiteral(colDefault)}`);
    }

    if (extra) {
      // Keep as-is (e.g. "auto_increment", "DEFAULT_GENERATED on update CURRENT_TIMESTAMP")
      parts.push(extra.toUpperCase().includes('AUTO_INCREMENT') ? 'AUTO_INCREMENT' : extra);
    }

    columnLines.push(`  ${parts.join(' ')}`);

    if (colKey === 'PRI') pkCols.push(String(colName));
    else if (colKey === 'UNI') uniqueCols.push(String(colName));
    else if (colKey === 'MUL') indexCols.push(String(colName));
  }

  /** @type {string[]} */
  const constraintLines = [];
  if (pkCols.length) {
    const colsSql = pkCols.map((c) => `\`${escapeIdent(c)}\``).join(', ');
    constraintLines.push(`  PRIMARY KEY (${colsSql})`);
  }

  // NOTE: INFORMATION_SCHEMA.COLUMNS doesn't provide full index definitions (composite indexes, names).
  // We emit conservative per-column indexes for UNI/MUL.
  for (const c of uniqueCols) {
    constraintLines.push(
      `  UNIQUE KEY \`uk_${escapeIdent(c)}\` (\`${escapeIdent(c)}\`)`
    );
  }
  for (const c of indexCols) {
    constraintLines.push(`  KEY \`idx_${escapeIdent(c)}\` (\`${escapeIdent(c)}\`)`);
  }

  const allLines = [...columnLines, ...constraintLines];
  return [
    `-- Generated from INFORMATION_SCHEMA.COLUMNS (may omit engine/charset/collation/foreign keys/checks/triggers/index shapes)`,
    `CREATE TABLE \`${escapeIdent(table)}\` (`,
    allLines.join(',\n'),
    `);`,
  ].join('\n');
}

function stripLeadingComments(sql) {
  let s = sql;
  s = s.replace(/^\s+/, '');
  // Strip repeated leading comments
  let changed = true;
  while (changed) {
    const before = s;
    // -- comment
    s = s.replace(/^--[^\n]*\n\s*/u, '');
    // # comment
    s = s.replace(/^#[^\n]*\n\s*/u, '');
    // /* block */
    s = s.replace(/^\/\*[\s\S]*?\*\/\s*/u, '');
    changed = s !== before;
  }
  return s;
}

function hasMultipleStatements(sql) {
  // Allow a single trailing semicolon, but disallow embedded semicolons.
  const trimmed = sql.trim();
  const withoutTrailing = trimmed.replace(/;+\s*$/u, '');
  return withoutTrailing.includes(';');
}

function isReadOnlySql(sql) {
  const s = stripLeadingComments(sql).trim();
  if (!s) return false;
  if (hasMultipleStatements(s)) return false;

  // Conservative denylist (anywhere in the statement)
  const denied = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'REPLACE',
    'ALTER',
    'DROP',
    'CREATE',
    'TRUNCATE',
    'GRANT',
    'REVOKE',
    'CALL',
    'LOAD',
    'HANDLER',
    'LOCK',
    'UNLOCK',
    'SET',
    'USE',
    'BEGIN',
    'COMMIT',
    'ROLLBACK',
    'PREPARE',
    'EXECUTE',
    'DEALLOCATE',
  ];

  const upper = s.toUpperCase();
  for (const kw of denied) {
    const re = new RegExp(`\\b${kw}\\b`, 'u');
    if (re.test(upper)) return false;
  }

  // Allowlist by first keyword
  if (/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/u.test(upper)) return true;

  // WITH can also prefix UPDATE/DELETE in MySQL; we deny those keywords above.
  // Still require SELECT to appear.
  if (/^WITH\b/u.test(upper)) {
    return /\bSELECT\b/u.test(upper);
  }

  return false;
}

function maybeApplyLimit(sql, maxRows) {
  const s = stripLeadingComments(sql).trim();
  const upper = s.toUpperCase();
  if (!(/^(SELECT|WITH)\b/u.test(upper))) return sql;
  if (/\bLIMIT\b/u.test(upper)) return sql;

  const hasSemi = /;+\s*$/u.test(sql);
  const base = sql.trim().replace(/;+\s*$/u, '');
  const limited = `${base}\nLIMIT ${maxRows}`;
  return hasSemi ? `${limited};` : limited;
}

function getAllowedCorsOrigins() {
  const raw = process.env.MCP_CORS_ORIGINS;
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Reasonable dev defaults (Next dev in this repo runs on :5000)
  return ['http://localhost:5000', 'http://127.0.0.1:5000'];
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;

  const allowed = getAllowedCorsOrigins();
  if (!allowed.includes(origin)) return;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function main() {
  // Load local env for running via `npm run mcp:mysql` (Next.js won't auto-load env for node scripts)
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local', override: false });
  dotenv.config({ path: '.env', override: false });

  const http = await import('node:http');
  const { URL } = await import('node:url');

  // Lazy-load ESM-only deps safely from CJS
  const mysql = await import('mysql2/promise');

  // MCP SDK imports (paths vary across SDK versions; try a couple)
  const sdkServer =
    (await import('@modelcontextprotocol/sdk/server/index.js').catch(() => null)) ||
    (await import('@modelcontextprotocol/sdk/server/index.mjs').catch(() => null));
  if (!sdkServer) throw new Error('Failed to import @modelcontextprotocol/sdk server module');

  const sdkTypes =
    (await import('@modelcontextprotocol/sdk/types.js').catch(() => null)) ||
    (await import('@modelcontextprotocol/sdk/types').catch(() => null));
  if (!sdkTypes) throw new Error('Failed to import @modelcontextprotocol/sdk types module');

  const sseMod =
    (await import('@modelcontextprotocol/sdk/server/sse.js').catch(() => null)) ||
    (await import('@modelcontextprotocol/sdk/server/sse').catch(() => null));
  if (!sseMod) throw new Error('Failed to import @modelcontextprotocol/sdk SSE transport module');

  const { Server } = sdkServer;
  const { SSEServerTransport } = sseMod;
  const { ListToolsRequestSchema, CallToolRequestSchema } = sdkTypes;

  const pool = mysql.createPool({
    host: requiredEnv('MYSQL_HOST'),
    port: intFromEnv('MYSQL_PORT', 3306),
    user: requiredEnv('MYSQL_USER'),
    password: requiredEnv('MYSQL_PASSWORD'),
    database: requiredEnv('MYSQL_DATABASE'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  const maxRows = intFromEnv('MCP_MAX_ROWS', 1000);

  const server = new Server(
    { name: 'mysql-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'mysql_query',
          description:
            'Execute a read-only SQL query against MySQL. Allowed: SELECT/SHOW/DESCRIBE/EXPLAIN (and WITH ... SELECT). Writes are blocked.',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sql: { type: 'string', description: 'SQL query to execute (read-only).' },
              params: {
                type: 'array',
                description: 'Optional positional parameters for a prepared statement.',
                items: {},
              },
            },
            required: ['sql'],
          },
        },
        {
          name: 'mysql_list_tables',
          description: 'List all tables in the currently configured MySQL database/schema.',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {},
          },
        },
        {
          name: 'mysql_describe_table',
          description:
            'Describe a table (columns, types, nullability, defaults, keys) in the currently configured MySQL database/schema.',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              table: { type: 'string', description: 'Table name to describe (no schema prefix).' },
            },
            required: ['table'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params ?? {};

    if (name === 'mysql_list_tables') {
      try {
        const [rows] = await pool.execute(
          `SELECT TABLE_NAME AS tableName
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_SCHEMA = DATABASE()
           ORDER BY TABLE_NAME`,
          []
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ tables: rows }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `MySQL error: ${err?.message || String(err)}` }],
          isError: true,
        };
      }
    }

    if (name === 'mysql_describe_table') {
      const table = typeof args?.table === 'string' ? args.table.trim() : '';
      if (!table) {
        return {
          content: [{ type: 'text', text: 'Missing required argument: table' }],
          isError: true,
        };
      }
      // Keep this conservative; we also parameterize the query.
      if (!/^[A-Za-z0-9_]+$/u.test(table)) {
        return {
          content: [{ type: 'text', text: 'Invalid table name. Use only letters, numbers, _.' }],
          isError: true,
        };
      }

      try {
        const [rows] = await pool.execute(
          `SELECT
             COLUMN_NAME AS columnName,
             COLUMN_TYPE AS columnType,
             IS_NULLABLE AS isNullable,
             COLUMN_DEFAULT AS columnDefault,
             COLUMN_KEY AS columnKey,
             EXTRA AS extra,
             ORDINAL_POSITION AS ordinalPosition
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          [table]
        );

        return {
          content: [
            {
              type: 'text',
              text: createTableSqlFromDescribeRows(table, rows),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `MySQL error: ${err?.message || String(err)}` }],
          isError: true,
        };
      }
    }

    if (name === 'mysql_query') {
      const sql = typeof args?.sql === 'string' ? args.sql : '';
      const params = Array.isArray(args?.params) ? args.params : [];

      if (!isReadOnlySql(sql)) {
        return {
          content: [
            {
              type: 'text',
              text:
                'Rejected: only read-only SQL is allowed (SELECT/SHOW/DESCRIBE/EXPLAIN, and WITH ... SELECT). Multiple statements and writes are blocked.',
            },
          ],
          isError: true,
        };
      }

      const effectiveSql = maybeApplyLimit(sql, maxRows);

      try {
        const [rows] = await pool.execute(effectiveSql, params);
        const text = `SQL:\n${effectiveSql}\n\n${rowsToStructuredPlainText(rows)}`;
        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `MySQL error: ${err?.message || String(err)}` }],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${String(name)}` }],
      isError: true,
    };
  });

  const host = process.env.MCP_HOST || '127.0.0.1';
  const port = intFromEnv('MCP_PORT', 7071);

  /** @type {Record<string, any>} */
  const transportsBySessionId = Object.create(null);

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

      // Enable browser access (CORS) for configured dev origins.
      applyCors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name: 'mysql-mcp', transport: 'sse' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/sse') {
        let transport;
        try {
          transport = new SSEServerTransport('/messages', res);
        } catch {
          transport = new SSEServerTransport({ endpoint: '/messages', res });
        }

        const sessionId = transport.sessionId || transport.session_id || transport.id;
        if (!sessionId) throw new Error('SSE transport did not provide a session id');

        transportsBySessionId[String(sessionId)] = transport;
        res.on('close', () => {
          delete transportsBySessionId[String(sessionId)];
        });

        await server.connect(transport);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/messages') {
        const sessionId = url.searchParams.get('sessionId') || url.searchParams.get('session_id');
        if (!sessionId) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing sessionId query param' }));
          return;
        }

        const transport = transportsBySessionId[String(sessionId)];
        if (!transport) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown sessionId' }));
          return;
        }

        if (typeof transport.handlePostMessage === 'function') {
          await transport.handlePostMessage(req, res);
          return;
        }
        if (typeof transport.handleRequest === 'function') {
          await transport.handleRequest(req, res);
          return;
        }

        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Transport does not support POST message handling' }));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err?.message || String(err) }));
    }
  });

  httpServer.listen(port, host, () => {
    console.log(`MySQL MCP server listening on http://${host}:${port}`);
    console.log(`- SSE endpoint:      http://${host}:${port}/sse`);
    console.log(`- Messages endpoint: http://${host}:${port}/messages?sessionId=...`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
