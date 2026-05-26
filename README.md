# Platinum Showcase

Suite moderna para presumir juegos platinados de Steam. Desarrollada con Astro SSR, Tailwind CSS v4 y MySQL 8.

## Stack

| Capa | Tecnologia |
|---|---|
| Framework | Astro 5 (SSR, output: `server`) |
| Adaptador | `@astrojs/node` (modo standalone) |
| Estilos | Tailwind CSS v4 (CSS-first config, sin `tailwind.config.js`) |
| Base de datos | MySQL 8 |
| Driver SQL | `mysql2` (promise wrapper) |
| API externa | Steam Web API |
| Lenguaje | TypeScript (`strict: true`) |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser / Client                        │
│  index.astro ──► PlatinumCard, GameCard, AchievementList     │
│  Modal "Agregar juego" ──► POST /api/games                   │
│  Sync Steam ──► POST /api/sync-steam                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP (SSR)
┌─────────────────────▼───────────────────────────────────────┐
│                    Astro Server (Node.js)                     │
│                                                              │
│  /api/games         GET  ──► juegos + stats de logros        │
│                     POST ──► upsert juego manual             │
│  /api/sync-steam    POST ──► sync biblioteca Steam → MySQL   │
│  /api/games/:id/                                          │
│    achievements     GET  ──► logros de un juego              │
└──────┬──────────────────────────────┬───────────────────────┘
       │                              │
┌──────▼────────┐          ┌──────────▼───────────────────────┐
│   MySQL 8     │          │       Steam Web API               │
│               │          │                                   │
│  games        │          │  GetOwnedGames                    │
│  achievements │          │  GetPlayerAchievements            │
│               │          │  GetSchemaForGame                 │
└───────────────┘          └───────────────────────────────────┘
```

## Estructura del proyecto

```
src/
├── components/
│   ├── AchievementList.astro   # Lista de logros con progreso
│   ├── GameCard.astro          # Tarjeta compacta (no platinados)
│   └── PlatinumCard.astro      # Tarjeta destacada con glow dorado
├── layouts/
│   └── BaseLayout.astro        # Shell HTML + Google Fonts
├── lib/
│   ├── db.ts                   # Pool MySQL, query<T>() tipado
│   └── steam.ts                # Wrapper Steam Web API
├── pages/
│   ├── index.astro             # Página principal
│   └── api/
│       ├── games.ts            # CRUD juegos
│       ├── sync-steam.ts       # Sincronización Steam → MySQL
│       └── games/[id]/
│           └── achievements.ts # Logros por juego
└── styles/
    └── global.css              # Tailwind v4 + @theme + animaciones
```

## Base de datos

### Tabla `games`

| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT UNSIGNED PK | Auto incremental |
| steam_app_id | INT UNSIGNED UNIQUE | ID de la app en Steam |
| name | VARCHAR(255) | Nombre del juego |
| cover_image_url | VARCHAR(512) | URL de la portada |
| playtime_hours | DECIMAL(8,2) | Horas jugadas |
| is_platinum | BOOLEAN | Tiene todos los logros |
| platinum_date | DATETIME | Fecha en que se platinó |
| display_order | INT | Orden de visualización |
| created_at / updated_at | DATETIME | Timestamps |

### Tabla `achievements`

| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT UNSIGNED PK | Auto incremental |
| game_id | INT UNSIGNED FK | Referencia a games.id |
| steam_achievement_id | VARCHAR(128) | ID del logro en Steam |
| name | VARCHAR(255) | Nombre del logro |
| description | TEXT | Descripción |
| icon_url | VARCHAR(512) | URL del ícono |
| unlocked | BOOLEAN | Desbloqueado o no |
| unlock_date | DATETIME | Fecha de desbloqueo |

## Variables de entorno

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=platinum_showcase
STEAM_API_KEY=your_steam_api_key_here
STEAM_USER_ID=your_steam_64bit_id_here
```

## API Endpoints

### `GET /api/games`

Devuelve todos los juegos con estadisticas de logros. Orden: platinados primero (por `platinum_date DESC`), resto por `display_order`.

```json
[{
  "id": 1,
  "steam_app_id": 730,
  "name": "Counter-Strike 2",
  "is_platinum": true,
  "achievement_pct": 100,
  "achievement_total": 1
}]
```

### `POST /api/games`

Agrega o actualiza un juego manualmente.

```json
{
  "steam_app_id": 730,
  "name": "Counter-Strike 2",
  "playtime_hours": 0,
  "display_order": 0
}
```

### `POST /api/sync-steam`

Sincroniza toda la biblioteca desde Steam API. Marca `is_platinum = true` si el 100% de logros estan desbloqueados.

```json
{
  "success": true,
  "synced": 42,
  "platinums_found": 3
}
```

### `GET /api/games/:id/achievements`

Devuelve todos los logros de un juego especifico.

```json
[{
  "id": 1,
  "steam_achievement_id": "WIN_ONE_MATCH",
  "name": "First Victory",
  "description": "Win your first match",
  "icon_url": "https://...",
  "unlocked": true,
  "unlock_date": "2025-01-15 22:30:00"
}]
```

## Diseño y animaciones

| Recurso | Tecnologia |
|---|---|
| Sistema de diseño | Tailwind CSS v4 utilitario puro |
| Tema | Fondo `zinc-950`, tipografia Inter, acentos `#FFD700` |
| Glow platinum | `@keyframes platinum-glow` — box-shadow animado en dorado |
| Contador platinos | `countUp` con `ease-out` via `requestAnimationFrame` |
| Scroll reveal | `IntersectionObserver` dispara el contador al hacer scroll |
| Skeleton loaders | `@keyframes skeleton-pulse` — estados vacíos antes de datos |
| Transiciones | `transition-all duration-300` en hover de tarjetas |
| Modal | `backdrop-blur-sm` con animación `fade-in-up` |
| Toast | Notificaciones temporales con entrada/salida animada |

## Comandos

```bash
npm run dev       # Desarrollo (localhost:4321)
npm run build     # Build de produccion
npm run preview   # Previsualizar build
npm start         # Produccion (node dist/server/entry.mjs)
```

## Setup

1. Clonar el repo
2. `npm install`
3. Copiar `.env.example` → `.env` y completar credenciales
4. Ejecutar `database/schema.sql` en MySQL 8
5. `npm run dev`
6. Visitar `http://localhost:4321`
7. Click en el boton "+" → "Sincronizar desde Steam"
