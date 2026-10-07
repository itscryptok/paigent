# Paigent — static web clone

Static web export of the **Paigent** app ("Your moments, as art" — turn photos
into AI artwork, order canvas prints). Original was an Expo (React Native)
app; this repo rebuilds it as an Expo web static export so it stays faithful
to the original screens.

- Live source: Replit Expo dev server (Metro source map recovery)
- Internal project name in the original repo: `canvas-print`
- Custom domain: https://paigent.app/

## Routes (Expo Router)

| Route | Screen |
|---|---|
| `/` | Camera home — capture, photo strip, artwork detail, cart |
| `/login`, `/(auth)/login` | Log in |
| `/register`, `/(auth)/register` | Create account |
| `/upgrade` | Premium upgrade ($3.99/mo) + credit packs |
| `/admin` | Admin panel (orders, settings) |
| `+not-found` | 404 screen |

## What works without the backend

Landing/camera UI, navigation, overlays, cart UI (local state), splash screen,
all static copy. Camera capture works in browsers that grant camera permission
(guest mode shows the login wall for artwork generation, same as the original).

## What needs the original backend (`/api/*`)

Per the static-clone decision these stay non-functional until a backend exists:

- `POST /api/photos/generate` — AI artwork generation (core feature)
- `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me` — auth
- `POST /api/auth/upgrade`, `POST /api/photos/buy-credits` — Stripe checkout
- `GET/POST /api/orders`, `POST /api/orders/:id/payment-intent` — orders
- `POST /api/admin/auth`, `GET /api/admin/orders`, `GET|PUT /api/admin/settings` — admin
- The linktree "Browse Photo Marketplace" (`/photos`) and "Sell Your Photos"
  (`/sell`) links point at the backend web server.

## Build

```sh
npm ci
npm run build   # expo export --platform web + SEO/static files into dist/
```

Publish directory: `dist`. SPA rewrite `/* → /index.html` recommended so deep
routes resolve on static hosts (the export also emits per-route HTML files).

## SEO

`app/+html.tsx` carries the baseline: title, meta description, canonical
`https://paigent.app/`, favicon + apple-touch-icon, OG/Twitter cards, JSON-LD.
`sitemap.xml` and `robots.txt` live in `static/` and are copied into `dist/`
by the build script.

## Source provenance

`src-original/` holds the raw files recovered from the Replit Metro source
map (byte-identical app source). The `app/`, `components/`, `constants/`,
`context/`, `assets/`, and `lib/` trees are that recovered source, rebuilt as
a standard Expo project around it.
