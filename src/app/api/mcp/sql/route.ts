import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

/**
 * HTTP “tool server” equivalent of `mcp/sql.js`, but as a Next.js API route (no MCP protocol).
 *
 * Endpoints:
 * - GET  /api/mcp/mysql?tool=list
 * - POST /api/mcp/mysql  { name: 'mysql_query'|'mysql_list_tables'|'mysql_describe_table', arguments: {...} }
 *
 * Env:
 * - MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 * - MCP_MAX_ROWS (default 1000) applied to SELECT/WITH ... SELECT without LIMIT
 */

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function formatCellValue(value: unknown): string {
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
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    const maxBytes = 32;
    const preview = value.subarray(0, maxBytes).toString('hex');
    const suffix = value.length > maxBytes ? '…' : '';
    return `<Buffer len=${value.length} hex=${preview}${suffix}>`;
  }
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 0);
  } catch {
    return String(value);
  }
}

function rowsToStructuredPlainText(rows: unknown): string {
  if (!Array.isArray(rows)) return formatCellValue(rows);
  if (rows.length === 0) return 'Row count: 0\nRows: (none)';

  const columns: string[] = [];
  const seen = new Set<string>();

  for (const r of rows.slice(0, 50)) {
    if (r && typeof r === 'object') {
      for (const k of Object.keys(r as Record<string, unknown>)) {
        if (!seen.has(k)) {
          seen.add(k);
          columns.push(k);
        }
      }
    }
  }

  const lines: string[] = [];
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

    const keys = columns.length ? columns : Object.keys(row as Record<string, unknown>);
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(row, k)) {
        lines.push(`  ${k}: ${formatCellValue((row as Record<string, unknown>)[k])}`);
      }
    }
  }

  return lines.join('\n');
}

function escapeIdent(name: string): string {
  return String(name).replace(/`/g, '``');
}

function isSqlBareDefaultToken(s: string): boolean {
  const v = String(s).trim();
  if (!v) return false;
  if (/^(NULL|CURRENT_TIMESTAMP(?:\(\d+\))?)$/iu.test(v)) return true;
  if (
    /^(NOW|UUID|UUID_TO_BIN|BIN_TO_UUID|CURRENT_DATE|CURRENT_TIME|LOCALTIME|LOCALTIMESTAMP)(\(\))?$/iu.test(
      v
    )
  ) {
    return true;
  }
  if (/^-?\d+(\.\d+)?$/u.test(v)) return true;
  if (/^0x[0-9a-f]+$/iu.test(v)) return true;
  return false;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  const s = String(value);
  if (isSqlBareDefaultToken(s)) return s.trim();
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function createTableSqlFromDescribeRows(table: string, rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `-- No columns found for table ${sqlLiteral(table)}\nCREATE TABLE \`${escapeIdent(
      table
    )}\` (\n  -- (no columns)\n);`;
  }

  const cols = [...rows].sort(
    (a, b) =>
      Number((a as { ordinalPosition?: unknown })?.ordinalPosition ?? 0) -
      Number((b as { ordinalPosition?: unknown })?.ordinalPosition ?? 0)
  );

  const columnLines: string[] = [];
  const pkCols: string[] = [];
  const uniqueCols: string[] = [];
  const indexCols: string[] = [];

  for (const r of cols) {
    const row = r as {
      columnName?: unknown;
      columnType?: unknown;
      isNullable?: unknown;
      columnDefault?: unknown;
      columnKey?: unknown;
      extra?: unknown;
    };
    const colName = String(row?.columnName ?? '');
    const colType = String(row?.columnType ?? '').trim() || 'TEXT';
    const isNullable = String(row?.isNullable ?? '').toUpperCase() === 'YES';
    const colDefault = row?.columnDefault;
    const colKey = String(row?.columnKey ?? '').toUpperCase(); // PRI | UNI | MUL | ''
    const extra = String(row?.extra ?? '');

    const parts: string[] = [];
    parts.push(`\`${escapeIdent(colName)}\``);
    parts.push(colType);
    parts.push(isNullable ? 'NULL' : 'NOT NULL');

    if (colDefault !== null && colDefault !== undefined) {
      parts.push(`DEFAULT ${sqlLiteral(colDefault)}`);
    }

    if (extra) {
      parts.push(extra.toUpperCase().includes('AUTO_INCREMENT') ? 'AUTO_INCREMENT' : extra);
    }

    columnLines.push(`  ${parts.join(' ')}`);

    if (colKey === 'PRI') pkCols.push(colName);
    else if (colKey === 'UNI') uniqueCols.push(colName);
    else if (colKey === 'MUL') indexCols.push(colName);
  }

  const constraintLines: string[] = [];
  if (pkCols.length) {
    const colsSql = pkCols.map((c) => `\`${escapeIdent(c)}\``).join(', ');
    constraintLines.push(`  PRIMARY KEY (${colsSql})`);
  }

  for (const c of uniqueCols) {
    constraintLines.push(`  UNIQUE KEY \`uk_${escapeIdent(c)}\` (\`${escapeIdent(c)}\`)`);
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

function stripLeadingComments(sql: string): string {
  let s = sql;
  s = s.replace(/^\s+/u, '');
  let changed = true;
  while (changed) {
    const before = s;
    s = s.replace(/^--[^\n]*\n\s*/u, '');
    s = s.replace(/^#[^\n]*\n\s*/u, '');
    s = s.replace(/^\/\*[\s\S]*?\*\/\s*/u, '');
    changed = s !== before;
  }
  return s;
}

function hasMultipleStatements(sql: string): boolean {
  const trimmed = sql.trim();
  const withoutTrailing = trimmed.replace(/;+\s*$/u, '');
  return withoutTrailing.includes(';');
}

function isReadOnlySql(sql: string): boolean {
  const s = stripLeadingComments(sql).trim();
  if (!s) return false;
  if (hasMultipleStatements(s)) return false;

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
    if (new RegExp(`\\b${kw}\\b`, 'u').test(upper)) return false;
  }

  if (/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/u.test(upper)) return true;
  if (/^WITH\b/u.test(upper)) return /\bSELECT\b/u.test(upper);
  return false;
}

function maybeApplyLimit(sql: string, maxRows: number): string {
  const s = stripLeadingComments(sql).trim();
  const upper = s.toUpperCase();
  if (!/^(SELECT|WITH)\b/u.test(upper)) return sql;
  if (/\bLIMIT\b/u.test(upper)) return sql;

  const hasSemi = /;+\s*$/u.test(sql);
  const base = sql.trim().replace(/;+\s*$/u, '');
  const limited = `${base}\nLIMIT ${maxRows}`;
  return hasSemi ? `${limited};` : limited;
}

let pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: requiredEnv('MYSQL_HOST'),
      port: intFromEnv('MYSQL_PORT', 3306),
      user: requiredEnv('MYSQL_USER'),
      password: requiredEnv('MYSQL_PASSWORD'),
      database: requiredEnv('MYSQL_DATABASE'),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

type ToolTextResult = { type: 'text'; text: string };
type ToolResponse = { content: ToolTextResult[]; isError?: boolean };

function ok(text: string): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }] };
  return NextResponse.json(body);
}

function err(text: string, status = 400): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }], isError: true };
  return NextResponse.json(body, { status });
}

async function handleListTables(): Promise<NextResponse> {
  try {
    const [rows] = await getPool().execute(
      `SELECT TABLE_NAME AS tableName
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_NAME`,
      []
    );
    return ok(JSON.stringify({ tables: rows }, null, 2));
  } catch (e) {
    return err(`MySQL error: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}

async function handleDescribeTable(table: string): Promise<NextResponse> {
  const t = table.trim();
  if (!t) return err('Missing required argument: table', 400);
  if (!/^[A-Za-z0-9_]+$/u.test(t)) {
    return err('Invalid table name. Use only letters, numbers, _.', 400);
  }

  try {
    const [rows] = await getPool().execute(
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
      [t]
    );
    return ok(createTableSqlFromDescribeRows(t, rows));
  } catch (e) {
    return err(`MySQL error: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}

async function handleQuery(sql: string, params: unknown[]): Promise<NextResponse> {
  if (!isReadOnlySql(sql)) {
    return err(
      'Rejected: only read-only SQL is allowed (SELECT/SHOW/DESCRIBE/EXPLAIN, and WITH ... SELECT). Multiple statements and writes are blocked.',
      400
    );
  }

  const maxRows = intFromEnv('MCP_MAX_ROWS', 1000);
  const effectiveSql = maybeApplyLimit(sql, maxRows);

  try {
    const [rows] = await getPool().execute(effectiveSql, Array.isArray(params) ? params : []);
    const text = `SQL:\n${effectiveSql}\n\n${rowsToStructuredPlainText(rows)}`;
    return ok(text);
  } catch (e) {
    return err(`MySQL error: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tool = (searchParams.get('tool') || 'list').trim();

  if (tool === 'list') {
    return NextResponse.json({
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
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        },
        {
          name: 'mysql_describe_table',
          description:
            'Describe a table (columns, types, nullability, defaults, keys) in the currently configured MySQL database/schema.',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: { table: { type: 'string', description: 'Table name to describe.' } },
            required: ['table'],
          },
        },
      ],
    });
  }

  // Convenience GETs (optional)
  if (tool === 'mysql_list_tables') return await handleListTables();
  if (tool === 'mysql_describe_table') return await handleDescribeTable(searchParams.get('table') || '');

  return err(`Unknown tool: ${tool}`, 400);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { name, arguments: args } = (body ?? {}) as {
    name?: unknown;
    arguments?: unknown;
  };

  if (typeof name !== 'string' || !name.trim()) return err('Missing tool name', 400);
  const toolName = name.trim();

  if (toolName === 'mysql_list_tables') return await handleListTables();

  if (toolName === 'mysql_describe_table') {
    const table = (args as { table?: unknown } | null)?.table;
    return await handleDescribeTable(typeof table === 'string' ? table : '');
  }

  if (toolName === 'mysql_query') {
    const sql = (args as { sql?: unknown } | null)?.sql;
    const params = (args as { params?: unknown } | null)?.params;
    return await handleQuery(typeof sql === 'string' ? sql : '', Array.isArray(params) ? params : []);
  }

  return err(`Unknown tool: ${toolName}`, 400);
}