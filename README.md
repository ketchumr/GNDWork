# Small Engine Shop — Convex Edition

The full engine-shop management app (work orders, customers, inventory, printable invoices) on **Convex** — a backend with typed server functions, built-in email/password auth, and **live queries** so every device updates in real time.

Ported feature-for-feature from the Supabase version:
- **Three roles** — admin, manager, technician
- **Shop-wide labor rate** (editable in Settings)
- **Per-order locked tax rate** — each work order keeps the tax rate in effect when it was created, so changing the rate later never alters past orders/invoices
- **Tax on the full subtotal** (labor + parts)
- **Printable invoices**
- **Inventory deduction** when a new work order is saved
- **Sample data** loader

```
convex/            ← backend (deployed to Convex)
  schema.ts        ← tables
  auth.ts          ← email/password
  lib.ts           ← role guards (requireUser / requireManagerPlus / requireAdmin)
  users.ts         ← profiles, roles, shop settings
  customers.ts, inventory.ts, workOrders.ts
  admin.ts         ← admin: delete staff
  seed.ts          ← sample data
src/               ← React frontend
  App.tsx          ← auth gate + sign-in
  Shop.tsx         ← all screens + printable invoice
  ui.tsx, styles.css
```

## Setup (~10 min)

Requires **Node.js 18+**.

```bash
cd engine-shop-convex
npm install
npx convex dev        # creates your free Convex project, writes VITE_CONVEX_URL to .env.local, deploys backend
```
In a second terminal, enable auth keys (one-time):
```bash
npx @convex-dev/auth
```
Then start the frontend:
```bash
npm run dev:frontend
```
Open the printed local URL (usually http://localhost:5173). Or run both together with `npm run dev`.

### First login & sample data
1. **Sign Up** — the first account becomes **admin** automatically.
2. Go to **Settings → Load sample data** to populate demo customers, parts, and work orders. (You can skip this and start clean.)
3. Other staff sign up themselves (they join as **technician**); set their roles under **Staff**.

## Roles

| | Admin | Manager | Technician |
|---|---|---|---|
| Work orders: view / create / edit | ✓ | ✓ | ✓ |
| Delete work orders | ✓ | ✓ | — |
| Customers | ✓ | ✓ | ✓ |
| Adjust inventory quantities | ✓ | ✓ | ✓ |
| Add/edit/delete parts | ✓ | ✓ | — |
| See cost / margin / stock value | ✓ | ✓ | — |
| Settings (labor & tax rates) | ✓ | ✓ | — |
| Staff accounts (roles, delete) | ✓ | — | — |

Role checks run **server-side** in the Convex functions, so they hold even if someone bypasses the UI. (Note: technician cost-hiding is applied in the UI; the inventory query returns cost to any signed-in staff. If you need cost truly withheld from technicians at the API level, that's a small change — split the inventory query by role; ask and I'll add it.)

## Deploy to production

The frontend (static site) and the Convex backend deploy separately. Deploy Convex first so you have the production URL to give Netlify.

### 1. Deploy the Convex backend
```bash
npx convex deploy
```
This pushes your functions/schema to a **production** Convex deployment and prints its URL (looks like `https://your-app-123.convex.cloud`). Copy that URL.

### 2. Host the frontend on Netlify
This repo includes a `netlify.toml` that sets the build command (`npm run build`) and publish directory (`dist`), plus an SPA redirect so page refreshes don't 404.

**Option A — connect your Git repo (recommended):**
1. Push this project to GitHub/GitLab.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Netlify reads `netlify.toml`, so build command and publish dir are already set.
4. **Site settings → Environment variables → Add** `VITE_CONVEX_URL` = the production URL from step 1.
5. Deploy. Netlify rebuilds automatically on every push.

**Option B — drag-and-drop / CLI (no Git):**
```bash
# set the prod URL for the build, then build
echo "VITE_CONVEX_URL=https://your-app-123.convex.cloud" > .env.production.local
npm run build
```
Then either drag the `dist/` folder onto the Netlify dashboard, or:
```bash
npm i -g netlify-cli
netlify deploy --prod --dir=dist
```

### Important: point Convex Auth at your Netlify URL
Convex Auth needs to know your site's real domain. After your Netlify site is live (e.g. `https://geeknextdoor.netlify.app`), set it in your **production** Convex deployment's environment variables (Convex dashboard → your prod deployment → Settings → Environment Variables):
```
SITE_URL = https://geeknextdoor.netlify.app
```
Then redeploy Convex (`npx convex deploy`) if needed. Without this, sign-in can fail on the live site even though it works locally.

> `VITE_CONVEX_URL` is read at **build time** by Vite, so if you change it you must trigger a fresh Netlify build (not just a redeploy of the old build).

## Notes
- **Real-time:** changes appear on all screens instantly via Convex live queries.
- **Change password:** any signed-in user can set a new password via the 🔑 button in the top bar (handled server-side by `convex/authActions.ts` using Convex Auth's `modifyAccountCredentials`). **Forgotten-password reset** (when locked out) still needs an email provider and isn't wired; for now an admin can delete and have the person re-register.
- The invoice opens in a new window and triggers the print dialog; the shop name/address in the invoice header are hard-coded in `Shop.tsx` (search `Small Engine Shop`) — easy to change.
# GNDWork
