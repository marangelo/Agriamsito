// ── API Route: GET /api/db-status ────────────────────────────
// Diagnostico: prueba la conexion a MySQL y muestra config.
import type { APIRoute } from 'astro';
import { query } from '../../lib/db.ts';

export const GET: APIRoute = async () => {
  const dbHost = (import.meta.env.DB_HOST as string) || process.env.DB_HOST || '(no definido)';
  const dbPort = (import.meta.env.DB_PORT as string) || process.env.DB_PORT || '(no definido)';
  const dbUser = (import.meta.env.DB_USER as string) || process.env.DB_USER || '(no definido)';
  const dbName = (import.meta.env.DB_NAME as string) || process.env.DB_NAME || '(no definido)';
  const dbPass = (import.meta.env.DB_PASSWORD as string) || process.env.DB_PASSWORD || '(no definido)';

  const result: Record<string, unknown> = {
    config: {
      DB_HOST: dbHost,
      DB_PORT: dbPort,
      DB_USER: dbUser,
      DB_NAME: dbName,
      DB_PASSWORD_SET: dbPass !== '(no definido)' && dbPass.length > 0,
    },
  };

  try {
    const rows = await query<{ count: number }>('SELECT COUNT(*) as count FROM games');
    result.status = 'connected';
    result.games_count = rows[0]?.count ?? 0;
  } catch (err) {
    result.status = 'error';
    result.error = err instanceof Error ? err.message : String(err);
    result.hint = 'Verifica que DB_HOST apunte al contenedor MySQL correcto y que ambos esten en la misma red Docker';
  }

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
