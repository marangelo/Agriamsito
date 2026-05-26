import mysql from 'mysql2/promise';

// ── Pool de conexiones MySQL con mysql2/promise ──────────────
// Las credenciales se leen exclusivamente desde variables de entorno.
const pool = mysql.createPool({
  host: (import.meta.env.DB_HOST as string) || process.env.DB_HOST || 'localhost',
  port: Number(import.meta.env.DB_PORT) || Number(process.env.DB_PORT) || 3306,
  user: (import.meta.env.DB_USER as string) || process.env.DB_USER || 'root',
  password: (import.meta.env.DB_PASSWORD as string) || process.env.DB_PASSWORD || '',
  database: (import.meta.env.DB_NAME as string) || process.env.DB_NAME || 'platinum_showcase',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

/**
 * Ejecuta una query SQL parametrizada y devuelve los resultados tipados.
 * @param sql    Consulta SQL con placeholders ?
 * @param params Array de valores a interpolar
 * @returns      Array de filas con el tipo genérico T
 */
export async function query<T>(sql: string, params?: (string | number | boolean | null)[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params as any[]);
  return rows as T[];
}

/**
 * Obtiene una conexión individual del pool para transacciones.
 */
export async function getConnection() {
  return pool.getConnection();
}

export default pool;
