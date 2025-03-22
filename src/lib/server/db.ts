import mysql, { RowDataPacket } from 'mysql2/promise';

// Create a connection pool
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

// Export a query function that uses the connection pool
export async function query<T extends RowDataPacket[]>(sql: string, params: unknown[] = []) {
  try {
    const [results] = await pool.execute<T>(sql, params);
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Export the pool for direct access if needed
export { pool }; 