# MerchTracker

Plan your merch purchases for anime conventions and travel destinations. Upload catalog pages, draw rectangles on items, mark them off as you buy them, compare prices across shops, and track per-booth spending — all in a self-hosted Nuxt 4 + SQLite app.

![Two modes](https://img.shields.io/badge/modes-Convention%20%2F%20Travel-purple)
![Nuxt 4](https://img.shields.io/badge/nuxt-4-00DC82)
![SQLite](https://img.shields.io/badge/db-SQLite-003B57)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- **Convention mode**: Halls → Booths → Catalogs/Articles/Receipts → Products
- **Travel mode**: Countries / Cities → Shops with date ranges
- **Interactive hall plans**: Upload a floor plan image, click to drop booth markers, drag to reposition
- **OCR booth-number detection**: Tesseract.js reads booth numbers off your floor plan image and pins them automatically
- **Catalog annotations**: Drag a rectangle over an item on a scanned catalog page → it becomes a product with size and price variants
- **Article galleries**: Multiple price sources per item (shop name, price, link) with "planned" / "paid" tracking
- **Receipt mode**: Tick off purchases against a checklist while standing at the booth
- **Cost tracking**: Per-booth, per-event, per-currency totals
- **User accounts**: Admin / editor / regular-user roles, scrypt-hashed passwords, httpOnly session cookies
- **Public / private events**: Mark an event public for anyone-can-view, or keep it private to you and people you invite
- **Per-event sharing**: Invite individual users or whole groups to view or edit specific events
- **Magic-link invites**: Generate a shareable URL — the recipient signs up (or signs in) and is auto-added to the event with the level you chose
- **Groups**: Create named groups, add members, share events with the whole group at once
- **Per-product privacy**: Products you add to a shared event are visible only to you + the event owner + edit-share collaborators — other view-share users don't see your "wishlist" items
- **Admin user management**: Admins can create users, change roles, reset passwords from `/admin/users`
- **Guest view**: Browse public events without an account — personal info, paid status, and spent totals are hidden
- **i18n**: English + German throughout

---

## Quick start with Docker Compose

### 1. Clone

```bash
git clone https://github.com/<you>/merch-tracker.git
cd merch-tracker
```

### 2. Set the admin password (optional but recommended)

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=your-strong-password-here
```

> If you skip this step, a random password is generated on first boot and printed to the container logs once. Read it from `docker compose logs merch-tracker`.

### 3. Boot

```bash
docker compose up -d --build
```

The app is now running on **http://localhost:3000**.

### 4. Sign in

Open `http://localhost:3000/login` and use the credentials from your `.env` (or the random one from the logs). Change it in **Account** → **Change password** afterwards.

---

## What gets persisted

The compose file creates two bind-mounted directories in your project root:

```
./data/        — SQLite database (merch-tracker.db + WAL files)
./uploads/     — Uploaded catalog and floor-plan images
```

Back these up to preserve your data. Everything else is ephemeral.

---

## Configuration

All settings are environment variables. The compose file already wires `env_file: .env` so anything in `.env` is passed straight into the container.

| Variable | Purpose | Default |
|---|---|---|
| `ADMIN_DEFAULT_USERNAME` | First-run admin username | `admin` |
| `ADMIN_DEFAULT_PASSWORD` | First-run admin password (only used if the `users` table is empty) | random, printed once |
| `UPLOAD_DIR` | Where uploaded images are written | `/app/uploads` (set by compose) |
| `HOST` | Listen address | `0.0.0.0` |
| `PORT` | Listen port | `3000` |

`ADMIN_DEFAULT_*` are only consulted on the very first run when no users exist. After that, change passwords through the **Account** page or by editing the DB directly.

---

## Common operations

### Update to a new version

```bash
git pull
docker compose up -d --build
```

The DB schema auto-migrates additive columns on startup (idempotent `ALTER TABLE`).

### View logs

```bash
docker compose logs -f merch-tracker
```

### Reset everything

```bash
docker compose down
rm -rf data uploads
docker compose up -d --build
```

### Reset just the admin password

Non-destructive — keeps all your events/booths/products, only rewrites the admin password hash and clears active sessions.

Local:

```bash
npm run reset-admin
```

Docker (host has Node installed):

```bash
docker compose stop merch-tracker
npm run reset-admin                  # writes to ./data/merch-tracker.db via the bind mount
docker compose start merch-tracker
```

Docker (host has no Node — run the script inside the container):

```bash
docker compose up -d --build         # rebuild once to bake scripts/ and better-sqlite3 into the image
docker compose exec merch-tracker \
  node /app/scripts/reset-admin.mjs /app/data/merch-tracker.db
```

The script reads `ADMIN_DEFAULT_USERNAME` / `ADMIN_DEFAULT_PASSWORD` from `.env`. Change those first if you want a different value.

If you'd rather wipe the database entirely (loses everything):

```bash
docker compose down
rm data/merch-tracker.db data/merch-tracker.db-shm data/merch-tracker.db-wal
docker compose up -d --build
```

### Behind a reverse proxy (Caddy / nginx / Traefik)

The app listens on plain HTTP. Terminate TLS at the proxy and forward to `http://merch-tracker:3000`. Sessions use `Secure` cookies in production (`!import.meta.dev`), so HTTPS at the edge is required for cookies to stick.

Caddy example:

```caddy
merch.example.com {
    reverse_proxy localhost:3000
}
```

---

## Development (without Docker)

Requires Node 20+.

```bash
npm install
cp .env.example .env   # optional, set ADMIN_DEFAULT_PASSWORD
npm run dev            # http://localhost:3000
```

Scripts:

```
npm run dev         # Nuxt dev server with HMR
npm run build       # Production build to .output/
npm run preview     # Serve the production build locally
npm run db:studio   # Drizzle Studio (DB browser)
```

---

## Tech stack

- **[Nuxt 4](https://nuxt.com)** with Vue 3 Composition API
- **[@nuxt/ui](https://ui.nuxt.com)** for components (Tailwind under the hood)
- **[Pinia](https://pinia.vuejs.org)** for state
- **[Drizzle ORM](https://orm.drizzle.team)** + **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)**
- **[Tesseract.js](https://github.com/naptha/tesseract.js)** for client-side OCR
- **Rolled-in-house auth**: Node's built-in `scrypt` for password hashing, httpOnly cookie sessions. No third-party auth service, no extra dependencies.

---

## Project layout (high-level)

```
app/         Nuxt frontend (pages, layouts, components, stores)
server/      Nitro backend (API routes, DB, auth utilities, file server)
data/        SQLite database (gitignored)
public/      Static assets (uploads also land here in dev)
.claude/     Notes for AI agents working on the codebase
Dockerfile           Multi-stage build (Node 20-alpine)
docker-compose.yml   One-service compose definition with bind mounts
```

For deeper details — schema, auth design, file-server architecture, known quirks — see [`.claude/CLAUDE.md`](.claude/CLAUDE.md).

---

## Permission model

| Action | Who can do it |
|---|---|
| View a public event | Anyone, even logged out |
| View a private event | Admin, event owner, any user who has been shared with directly, any member of a group the event is shared with, or anyone holding a valid invite link |
| See another collaborator's products on a shared event | Only the product creator + event owner + admin + edit-share collaborators. View-only shares see the event owner's products plus their own |
| Edit content in an event (add booths/products/upload images, mark items purchased) | Admin, `editor` role, event owner, any user with an `edit`-level share |
| Toggle public/private, share/unshare, mint/revoke invite links, delete the event | Admin or event owner only |
| Create a new event | Any logged-in user (they become the owner) |
| Manage users (create/delete/change role/reset password) | Admin only — `/admin/users` |
| Manage groups | Group owner or admin — `/admin/groups` |
| Add/remove members of a group | Group owner or admin; members can remove themselves (leave) |

Sessions are httpOnly, SameSite=Lax, 30-day TTL, and `Secure` in production. Passwords are scrypt-hashed with random per-user salts. No third-party auth service is involved. If a session expires mid-action, the client auto-redirects to `/login` with a `?redirect=` back-link.

---

## License

MIT
