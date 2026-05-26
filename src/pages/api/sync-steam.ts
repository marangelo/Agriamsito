// ── API Route: POST /api/sync-steam (streaming) ─────────────
import type { APIRoute } from 'astro';
import { query } from '../../lib/db.ts';
import {
  getOwnedGames,
  getPlayerAchievements,
  getSchemaForGame,
  getCoverUrl,
  getAchievementIconUrl,
  getGameDetails,
} from '../../lib/steam.ts';

// ── Rate limiter simple (en memoria) ─────────────────────────
const syncCooldown = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos entre sincronizaciones

function checkRateLimit(ip: string): { ok: boolean; remaining: number } {
  const last = syncCooldown.get(ip);
  const now = Date.now();
  if (last && now - last < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    return { ok: false, remaining };
  }
  syncCooldown.set(ip, now);
  // Limpiar entradas viejas cada tanto
  if (syncCooldown.size > 1000) {
    const cutoff = now - COOLDOWN_MS * 2;
    for (const [k, v] of syncCooldown) {
      if (v < cutoff) syncCooldown.delete(k);
    }
  }
  return { ok: true, remaining: 0 };
}

const SYNC_SECRET = (import.meta.env.SYNC_SECRET as string) || process.env.SYNC_SECRET || '';

function sse(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function* syncGenerator(): AsyncGenerator<string> {
  const steamKey = (import.meta.env.STEAM_API_KEY as string) || process.env.STEAM_API_KEY || '';
  const steamUser = (import.meta.env.STEAM_USER_ID as string) || process.env.STEAM_USER_ID || '';

  if (!steamKey || !steamUser) {
    yield sse({
      type: 'error',
      message: 'STEAM_API_KEY o STEAM_USER_ID no configurados en .env',
    });
    return;
  }

  let steamGames;
  try {
    steamGames = await getOwnedGames();
  } catch (err) {
    yield sse({
      type: 'error',
      message: `Error al conectar con Steam: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  if (!steamGames || steamGames.length === 0) {
    yield sse({
      type: 'error',
      message: 'No se recibieron juegos de Steam. Asegurate que tu perfil sea PUBLICO.',
      hint: 'Settings → Privacy → Game details → Public',
    });
    return;
  }

  const total = steamGames.length;
  yield sse({ type: 'start', total, message: `Sincronizando ${total} juegos...` });

  const gamesWithStats = steamGames.filter((g) => g.has_community_visible_stats);
  const gamesWithoutStats = steamGames.filter((g) => !g.has_community_visible_stats);

  // Primero insertar juegos sin logros (rapido)
  for (const game of gamesWithoutStats) {
    const storeData = await getGameDetails(game.appid).catch(() => null);
    const coverUrl = storeData?.header_image || getCoverUrl(game.appid);
    const desc = storeData?.short_description || null;
    await query(
      `INSERT INTO games (steam_app_id, name, cover_image_url, description, icon_hash, playtime_hours, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), cover_image_url = VALUES(cover_image_url),
         description = VALUES(description), icon_hash = VALUES(icon_hash),
         playtime_hours = VALUES(playtime_hours)`,
      [game.appid, game.name, coverUrl, desc, game.img_icon_url, game.playtime_forever / 60, 0],
    );
  }

  let synced = 0;
  let platinums = 0;
  let errors = 0;

  const totalWithStats = gamesWithStats.length;
  const grandTotal = total;

  for (let i = 0; i < totalWithStats; i++) {
    const game = gamesWithStats[i];

    yield sse({
      type: 'progress',
      current: i + 1,
      total: totalWithStats,
      grandTotal,
      game: game.name,
      appid: game.appid,
      message: `(${i + 1}/${totalWithStats}) ${game.name}`,
    });

    const storeData = await getGameDetails(game.appid).catch(() => null);
    const coverUrl = storeData?.header_image || getCoverUrl(game.appid);
    const desc = storeData?.short_description || null;

    await query(
      `INSERT INTO games (steam_app_id, name, cover_image_url, description, icon_hash, playtime_hours, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), cover_image_url = VALUES(cover_image_url),
         description = VALUES(description), icon_hash = VALUES(icon_hash),
         playtime_hours = VALUES(playtime_hours)`,
      [game.appid, game.name, coverUrl, desc, game.img_icon_url, game.playtime_forever / 60, i],
    );

    const rows = await query<{ id: number }>(
      `SELECT id FROM games WHERE steam_app_id = ?`, [game.appid],
    );
    const gameId = rows[0]?.id;
    if (!gameId) continue;

    // Logros
    try {
      const [playerAchievements, schemaAchievements] = await Promise.all([
        getPlayerAchievements(game.appid),
        getSchemaForGame(game.appid),
      ]);

      if (!playerAchievements || playerAchievements.length === 0) {
        synced++;
        continue;
      }

      const schemaMap = new Map(schemaAchievements.map((s) => [s.name, s] as const));
      let unlockedCount = 0;
      const totalAchievements = playerAchievements.length;

      for (const ach of playerAchievements) {
        const schema = schemaMap.get(ach.apiname);
        const iconUrl = schema?.icon ? getAchievementIconUrl(schema.icon) : null;
        const displayName = schema?.displayName ?? ach.apiname;
        const description = schema?.description ?? null;

        if (ach.achieved === 1) unlockedCount++;

        await query(
          `INSERT INTO achievements (game_id, steam_achievement_id, name, description, icon_url, unlocked, unlock_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             name = VALUES(name), description = VALUES(description), icon_url = VALUES(icon_url),
             unlocked = VALUES(unlocked), unlock_date = VALUES(unlock_date)`,
          [gameId, ach.apiname, displayName, description, iconUrl, ach.achieved === 1,
           ach.unlocktime > 0 ? new Date(ach.unlocktime * 1000).toISOString().slice(0, 19).replace('T', ' ') : null],
        );
      }

      const isPlat = totalAchievements > 0 && unlockedCount === totalAchievements;
      if (isPlat) {
        platinums++;
        await query(`UPDATE games SET is_platinum = true, platinum_date = NOW() WHERE id = ?`, [gameId]);
        yield sse({
          type: 'platinum',
          game: game.name,
          unlockedCount,
          totalAchievements,
          message: `PLATINUM: ${game.name}`,
        });
      }
    } catch (achErr) {
      errors++;
      console.warn(`[sync] Logros fallaron para "${game.name}":`, achErr);
    }

    synced++;
  }

  yield sse({
    type: 'done',
    synced,
    platinums_found: platinums,
    errors,
    message: `Sincronizados ${synced + gamesWithoutStats.length} juegos. ${platinums} platinos encontrados.`,
  });
}

export const POST: APIRoute = async ({ request }) => {
  // ── Validacion: SYNC_SECRET opcional ────────────────────────
  if (SYNC_SECRET) {
    const header = request.headers.get('x-sync-secret') || '';
    const param = new URL(request.url).searchParams.get('secret') || '';
    if (header !== SYNC_SECRET && param !== SYNC_SECRET) {
      return new Response(JSON.stringify({ error: 'Se requiere x-sync-secret valido' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Rate limiting por IP ────────────────────────────────────
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    return new Response(JSON.stringify({
      error: `Debes esperar ${limit.remaining}s entre sincronizaciones`,
      retry_after: limit.remaining,
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of syncGenerator()) {
          controller.enqueue(new TextEncoder().encode(event));
        }
      } catch (err) {
        const msg = `Error fatal: ${err instanceof Error ? err.message : String(err)}`;
        controller.enqueue(new TextEncoder().encode(sse({ type: 'error', message: msg })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
