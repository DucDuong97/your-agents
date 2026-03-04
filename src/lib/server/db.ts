import mysql, { RowDataPacket } from 'mysql2/promise';

// ----- Default pool (unprefixed env: MYSQL_HOST, MYSQL_USER, ...) -----
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function query<T extends RowDataPacket[]>(sql: string, params: unknown[] = []) {
  try {
    const [results] = await pool.execute<T>(sql, params);
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export { pool };

// ----- Env-prefixed pools for MCP (e.g. env=local => LOCAL_MYSQL_HOST, ...) -----

export function requiredEnv(name: string, env?: string): string {
  const envPrefix = env ? `${env.toUpperCase()}_` : '';
  const envName = `${envPrefix}${name}`;
  const v = process.env[envName];
  if (!v) throw new Error(`Missing required environment variable: ${envName}`);
  return v;
}

export function intFromEnv(name: string, fallback: number, env?: string): number {
  const envPrefix = env ? `${env.toUpperCase()}_` : '';
  const envName = `${envPrefix}${name}`;
  const raw = process.env[envName];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

const envPools: Map<string, mysql.Pool> = new Map();

export function getPool(env?: string): mysql.Pool {
  const envKey = env || 'local';
  if (!envPools.has(envKey)) {
    envPools.set(envKey, mysql.createPool({
      host: requiredEnv('MYSQL_HOST', env),
      port: intFromEnv('MYSQL_PORT', 3306, env),
      user: requiredEnv('MYSQL_USER', env),
      password: requiredEnv('MYSQL_PASSWORD', env),
      database: requiredEnv('MYSQL_DATABASE', env),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    }));
  }
  return envPools.get(envKey)!;
} 