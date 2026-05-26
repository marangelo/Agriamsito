// ── API Route: GET /api/steam-status ────────────────────────
// Endpoint de diagnostico: prueba la conexion a Steam API paso a paso.
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const results: { step: string; status: 'ok' | 'error'; detail: string }[] = [];

  const steamKey = (import.meta.env.STEAM_API_KEY as string) || process.env.STEAM_API_KEY || '';
  const steamUser = (import.meta.env.STEAM_USER_ID as string) || process.env.STEAM_USER_ID || '';

  // Paso 1: variables de entorno
  if (!steamKey) {
    results.push({ step: 'STEAM_API_KEY', status: 'error', detail: 'No definida en .env' });
  } else {
    results.push({ step: 'STEAM_API_KEY', status: 'ok', detail: `Set: ${steamKey.slice(0, 4)}...` });
  }

  if (!steamUser) {
    results.push({ step: 'STEAM_USER_ID', status: 'error', detail: 'No definido en .env' });
    return new Response(JSON.stringify({ results, all_ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    results.push({ step: 'STEAM_USER_ID', status: 'ok', detail: steamUser });
  }

  // Paso 2: connectivity test (ISteamWebAPIUtil/GetServerInfo)
  try {
    const infoUrl = `https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/`;
    const infoRes = await fetch(infoUrl, { cache: 'no-store' });
    results.push({
      step: 'Steam API connectivity',
      status: 'ok',
      detail: `HTTP ${infoRes.status}`,
    });
  } catch (e) {
    results.push({
      step: 'Steam API connectivity',
      status: 'error',
      detail: `No se puede conectar a api.steampowered.com: ${String(e)}`,
    });
    return new Response(JSON.stringify({ results, all_ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Paso 3: validar API key (GetPlayerSummaries sin key debe fallar 403)
  try {
    const testUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${steamKey}&steamids=${steamUser}`;
    const testRes = await fetch(testUrl, { cache: 'no-store' });

    if (testRes.status === 403) {
      results.push({
        step: 'API Key validation',
        status: 'error',
        detail: 'HTTP 403 — STEAM_API_KEY invalida o revocada. Genera una nueva en https://steamcommunity.com/dev/apikey',
      });
      return new Response(JSON.stringify({ results, all_ok: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const testJson = await testRes.json() as Record<string, any>;
    const players = testJson.response?.players;

    if (!players || players.length === 0) {
      results.push({
        step: 'User lookup',
        status: 'error',
        detail: `STEAM_USER_ID ${steamUser} no retorno ningun perfil. Verifica que sea tu SteamID64 correcto.`,
      });
      return new Response(JSON.stringify({ results, all_ok: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const player = players[0];
    results.push({
      step: 'User lookup',
      status: 'ok',
      detail: `Perfil: ${player.personaname} — visibilidad: ${player.communityvisibilitystate} (3=publico)`,
    });

    if (String(player.communityvisibilitystate) !== '3') {
      results.push({
        step: 'Profile privacy',
        status: 'error',
        detail: `Visibilidad=${player.communityvisibilitystate}. Steam requiere estado=3 (publico) para leer la biblioteca de juegos.`,
      });
      return new Response(JSON.stringify({ results, all_ok: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (e) {
    results.push({
      step: 'User lookup',
      status: 'error',
      detail: `Error al consultar perfil: ${String(e)}`,
    });
    return new Response(JSON.stringify({ results, all_ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Paso 4: probar GetOwnedGames
  try {
    const gamesUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${steamKey}&steamid=${steamUser}&include_appinfo=1&include_played_free_games=1`;
    const gamesRes = await fetch(gamesUrl, { cache: 'no-store' });

    if (gamesRes.status === 403) {
      results.push({
        step: 'GetOwnedGames',
        status: 'error',
        detail: `HTTP 403 — perfil privado o API key sin permiso. Verifica Settings → Privacy Settings → Game details → Public.`,
      });
    } else {
      const gamesJson = await gamesRes.json() as Record<string, any>;
      const gameCount = gamesJson.response?.game_count ?? 0;
      results.push({
        step: 'GetOwnedGames',
        status: 'ok',
        detail: `${gameCount} juegos encontrados, HTTP ${gamesRes.status}`,
      });
    }
  } catch (e) {
    results.push({
      step: 'GetOwnedGames',
      status: 'error',
      detail: `Error: ${String(e)}`,
    });
  }

  const allOk = results.every((r) => r.status === 'ok');

  return new Response(JSON.stringify({ results, all_ok: allOk }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
