// ── API Route: GET /api/games/:id/achievements ─────────────
import type { APIRoute } from 'astro';
import { query } from '../../../../lib/db.ts';

/**
 * Sanitiza icon_urls rotas por el bug anterior de getAchievementIconUrl.
 * El bug duplicaba el prefijo CDN + el schema ya traia URL completa.
 */
function sanitizeIconUrl(url: string | null): string | null {
  if (!url) return null;

  // Si contiene la URL completa de steamcdn (esquema de Steam), extraerla
  const steamCdnMatch = url.match(/(https:\/\/steamcdn-a\.akamaihd\.net\/steamcommunity\/public\/images\/apps\/[^"'\s]+\.jpg)/i);
  if (steamCdnMatch) return steamCdnMatch[1];

  // Si tiene doble prefijo CDN, tomar la parte interna
  const doubleWrapMatch = url.match(/(https?:\/\/[^\/]+\/steamcommunity\/public\/images\/apps\/)(https?:\/\/)/i);
  if (doubleWrapMatch) {
    const inner = url.substring(url.indexOf(doubleWrapMatch[2]));
    return inner;
  }

  // Si termina en .jpg.jpg, quitar el duplicado
  if (url.endsWith('.jpg.jpg')) {
    return url.slice(0, -4);
  }

  // Si ya es URL valida de imagen, devolver asi nomas
  if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url)) {
    return url;
  }

  return url;
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Game ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const achievements = await query(
      `SELECT id, steam_achievement_id, name, description, icon_url,
              unlocked, unlock_date
       FROM achievements
       WHERE game_id = ?
       ORDER BY unlocked DESC, unlock_date DESC`,
      [Number(id)],
    );

    // Sanitizar URLs rotas
    const cleaned = (achievements as any[]).map((a) => ({
      ...a,
      icon_url: sanitizeIconUrl(a.icon_url),
    }));

    return new Response(JSON.stringify(cleaned), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[GET /api/games/:id/achievements] Error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch achievements' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
