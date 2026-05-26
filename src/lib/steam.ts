// ── Tipos para respuestas de Steam Web API ──────────────────

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url: string;
  img_logo_url: string;
  has_community_visible_stats: boolean;
}

export interface SteamAchievement {
  apiname: string;
  achieved: number; // 0 = locked, 1 = unlocked
  unlocktime: number; // Unix timestamp
  name?: string;
  description?: string;
  icon?: string;
  icongray?: string;
}

export interface SteamAchievementSchema {
  name: string;
  defaultvalue: number;
  displayName: string;
  hidden: number;
  description: string;
  icon: string;
  icongray: string;
}

// ── Constantes ───────────────────────────────────────────────
const STEAM_API_BASE = 'https://api.steampowered.com';

/**
 * Obtiene la API key y user ID desde variables de entorno del proceso.
 * En Astro SSR, import.meta.env funciona en build time pero en runtime
 * se resuelve via process.env. Esta funcion usa ambos fallbacks.
 */
function getSteamKey(): string {
  return (import.meta.env.STEAM_API_KEY as string)
    || process.env.STEAM_API_KEY
    || '';
}

function getSteamUserId(): string {
  return (import.meta.env.STEAM_USER_ID as string)
    || process.env.STEAM_USER_ID
    || '';
}

/**
 * Wrapper tipado para fetch con manejo de errores hacia Steam API.
 */
async function fetchSteam<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(endpoint, STEAM_API_BASE);
  url.searchParams.set('key', getSteamKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { cache: 'no-store' });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Steam API HTTP ${res.status}: ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`);
  }

  const data = await res.json() as T;
  return data;
}

// ── Tipos de respuesta de la API ─────────────────────────────

export interface OwnedGamesResponse {
  response: {
    game_count: number;
    games: SteamGame[];
  };
}

export interface PlayerAchievementsResponse {
  playerstats: {
    steamID: string;
    gameName: string;
    achievements: SteamAchievement[];
    success: boolean;
  };
}

export interface SchemaForGameResponse {
  game: {
    gameName: string;
    gameVersion: string;
    availableGameStats: {
      achievements: SteamAchievementSchema[];
    };
  };
}

/**
 * Obtiene la lista de juegos del usuario con tiempo jugado.
 * IPlayerService/GetOwnedGames v0001
 */
export async function getOwnedGames(): Promise<SteamGame[]> {
  const steamId = getSteamUserId();
  const data = await fetchSteam<OwnedGamesResponse>(
    '/IPlayerService/GetOwnedGames/v0001/',
    {
      steamid: steamId,
      include_appinfo: '1',
      include_played_free_games: '1',
    },
  );
  return data.response?.games ?? [];
}

/**
 * Obtiene los logros del usuario para un juego especifico.
 * ISteamUserStats/GetPlayerAchievements v0001
 */
export async function getPlayerAchievements(appId: number): Promise<SteamAchievement[]> {
  const steamId = getSteamUserId();
  const data = await fetchSteam<PlayerAchievementsResponse>(
    '/ISteamUserStats/GetPlayerAchievements/v0001/',
    {
      steamid: steamId,
      appid: String(appId),
      l: 'english',
    },
  );

  if (!data.playerstats || !data.playerstats.success) {
    return [];
  }

  return data.playerstats.achievements ?? [];
}

/**
 * Obtiene el schema (nombres, descripciones, iconos) de logros de un juego.
 * ISteamUserStats/GetSchemaForGame v0002
 */
export async function getSchemaForGame(appId: number): Promise<SteamAchievementSchema[]> {
  const data = await fetchSteam<SchemaForGameResponse>(
    '/ISteamUserStats/GetSchemaForGame/v0002/',
    {
      appid: String(appId),
      l: 'english',
    },
  );
  return data.game?.availableGameStats?.achievements ?? [];
}

/**
 * Obtiene detalles de un juego desde Steam Store API (descripcion, portada actualizada).
 * URL: https://store.steampowered.com/api/appdetails?appids={appid}
 */
export interface SteamStoreDetails {
  success: boolean;
  data?: {
    steam_appid: number;
    name: string;
    short_description: string;
    detailed_description?: string;
    header_image: string;
    capsule_image?: string;
    capsule_imagev5?: string;
    website?: string;
    developers?: string[];
    publishers?: string[];
    genres?: { id: string; description: string }[];
  };
}

export async function getGameDetails(appId: number): Promise<SteamStoreDetails['data'] | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=spanish`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json() as Record<string, SteamStoreDetails>;
  const entry = json[String(appId)];
  if (!entry?.success || !entry.data) return null;
  return entry.data;
}

/**
 * Obtiene la URL de portada mas actualizada desde la Store API, o fallback a la generada.
 */
export async function getLatestCoverUrl(appId: number): Promise<string> {
  try {
    const details = await getGameDetails(appId);
    if (details?.header_image) return details.header_image;
  } catch {}
  return getCoverUrl(appId);
}

/**
 * URL de la portada de un juego de Steam (header 460x215).
 */
export function getCoverUrl(appId: number, hash?: string): string {
  if (hash) {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${hash}.jpg`;
  }
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

/**
 * URL de la imagen hero de un juego (1920x620) — ideal para fondos full-width.
 */
export function getHeroUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`;
}

/**
 * Genera la URL del icono cuadrado de un juego (el de la library de Steam).
 * El hash viene de img_icon_url en GetOwnedGames.
 */
export function getGameIconUrl(appId: number, iconHash: string): string {
  if (!iconHash) return '';
  return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`;
}

/**
 * Genera la URL del icono de un logro.
 * El schema de Steam puede devolver URL completa o solo hash.
 */
export function getAchievementIconUrl(iconOrUrl: string): string {
  if (!iconOrUrl) return '';
  // Si ya es URL completa, usarla directamente
  if (iconOrUrl.startsWith('http://') || iconOrUrl.startsWith('https://')) {
    return iconOrUrl;
  }
  return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${iconOrUrl}.jpg`;
}
