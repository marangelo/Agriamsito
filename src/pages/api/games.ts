// ── API Route: /api/games ────────────────────────────────────
// GET  → devuelve juegos ordenados (platinados primero, luego por display_order)
// POST → agrega un juego manualmente o por steam_app_id
import type { APIRoute } from 'astro';
import { query } from '../../lib/db.ts';

export interface GameRow {
  id: number;
  steam_app_id: number;
  name: string;
  cover_image_url: string | null;
  description: string | null;
  icon_hash: string | null;
  playtime_hours: number;
  is_platinum: number;
  platinum_date: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AchievementRow {
  id: number;
  game_id: number;
  steam_achievement_id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  unlocked: number;
  unlock_date: string | null;
}

export interface GameWithStats extends Omit<GameRow, 'is_platinum'> {
  is_platinum: boolean;
  achievement_pct: number;
  achievement_total: number;
}

// GET /api/games
export const GET: APIRoute = async () => {
  try {
    // ── Juegos platinados: ordenados por platinum_date DESC ────
    const platinumGames = await query<GameRow>(
      `SELECT * FROM games WHERE is_platinum = true ORDER BY platinum_date DESC`,
    );

    // ── Resto de juegos: ordenados por display_order ────────────
    const otherGames = await query<GameRow>(
      `SELECT * FROM games WHERE is_platinum = false ORDER BY display_order ASC`,
    );

    const allGames = [...platinumGames, ...otherGames];

    // ── Cargar estadísticas de logros para cada juego ──────────
    const gamesWithStats: GameWithStats[] = await Promise.all(
      allGames.map(async (game) => {
        const total = await query<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM achievements WHERE game_id = ?`,
          [game.id],
        );
        const unlocked = await query<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM achievements WHERE game_id = ? AND unlocked = true`,
          [game.id],
        );

        const totalCount = total[0]?.cnt ?? 0;
        const unlockedCount = unlocked[0]?.cnt ?? 0;
        const pct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

        return {
          ...game,
          is_platinum: game.is_platinum === 1,
          achievement_pct: pct,
          achievement_total: totalCount,
        };
      }),
    );

    return new Response(JSON.stringify(gamesWithStats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[GET /api/games] Error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch games' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST /api/games
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { steam_app_id, name, cover_image_url, playtime_hours, display_order } = body;

    if (!steam_app_id || !name) {
      return new Response(JSON.stringify({ error: 'steam_app_id and name are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Upsert: inserta o actualiza si ya existe el steam_app_id ──
    await query(
      `INSERT INTO games (steam_app_id, name, cover_image_url, description, playtime_hours, display_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         cover_image_url = VALUES(cover_image_url),
         description = VALUES(description),
         playtime_hours = VALUES(playtime_hours),
         display_order = VALUES(display_order)`,
      [
        steam_app_id,
        name,
        cover_image_url ?? null,
        body.description ?? null,
        playtime_hours ?? 0,
        display_order ?? 0,
      ],
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[POST /api/games] Error:', err);
    return new Response(JSON.stringify({ error: 'Failed to add game' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
