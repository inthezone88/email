# Email → Revenue

Ties booked calls and sales in GoHighLevel back to the specific email that drove them. It answers one question: **which emails make money?**

The desktop dashboard has five reports: Campaigns, Sequences, Segments, List health and Contact journeys. Below 700px it switches to a phone layout (Overview, Emails, More, Settings) that can be installed as a PWA.

Stack: Next.js 16 (App Router) + TypeScript, Postgres via Drizzle, deployed on Railway as a single Node service.

## Quick start (local)

```bash
cp .env.example .env            # fill DATABASE_URL, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, ADMIN_EMAILS
npm install
npm run db:migrate              # applies drizzle/*.sql
npm run db:seed                 # optional: a "Demo" sub-account with realistic data
npm run dev
```

Sign in at `/login` with an address listed in `ADMIN_EMAILS`. Without `RESEND_API_KEY`, the sign-in link is printed to the server log in dev.

```bash
npm test        # unit tests: attribution engine, metric formulas, alerts, signatures, mappers
npm run lint    # tsc --noEmit
```

## Deploy (Railway)

1. In a Railway project, add a **PostgreSQL** service. Then add a service from this GitHub repo.
2. On the app service, set the variables from `.env.example`:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - Generate `SESSION_SECRET` with `openssl rand -base64 48`.
   - Generate `TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32`.
   - Choose your own values for `WEBHOOK_SECRET` and `CRON_SECRET`.
   - Put your address in `ADMIN_EMAILS`.
   - Set `APP_URL` and `GHL_REDIRECT_URI` to the service's public domain (Settings → Networking → Generate domain).
3. `railway.json` handles the rest:
   - It builds with `npm run build`.
   - Before each deploy it applies migrations (`npm run db:migrate:deploy`).
   - It starts with `npm start`, which listens on `$PORT`.
   - It health-checks `/api/healthz`.
4. Background jobs run inside the app (`src/instrumentation.ts` → `src/server/scheduler.ts`), so no cron service is needed:
   - Token refresh every 6 hours.
   - GHL reconcile, re-attribution and alerts at 07:17 UTC.

   Keep the service at **one replica**. If you add replicas or PR previews, set `DISABLE_CRON=true` on the extras.
5. Optional: load the demo data into the Railway database with `railway run npm run db:seed`.

To trigger the jobs by hand: `curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/nightly` (or `/api/cron/tokens`).

## Connecting GoHighLevel

1. **Create a Marketplace app** (private or unlisted) at <https://marketplace.gohighlevel.com>.
   - Set distribution to *Sub-account*.
   - Set the redirect URL to `https://<your-app>.up.railway.app/api/ghl/callback`, which is also `GHL_REDIRECT_URI`.
   - Add the read-only scopes listed in `src/server/ghl/client.ts` (`GHL_SCOPES`).
   - Copy the client id and secret into `GHL_CLIENT_ID` and `GHL_CLIENT_SECRET`.
2. **Webhooks.**
   - In the app's webhook settings, set the URL to `https://<your-app>/api/webhooks/ghl`.
   - Subscribe to: Contact*, Appointment*, Opportunity*, Order/Invoice/Transaction events, `LCEmailStats` and `UNINSTALL`.
   - Paste the public key(s) from GHL's *Webhook Integration Guide* into `GHL_WEBHOOK_ED25519_PUBLIC_KEY`, `GHL_WEBHOOK_RSA_PUBLIC_KEY`, or both.
3. In the app: **Settings → Connect sub-account**. Tokens are stored AES-256-GCM encrypted and refreshed automatically. The first connect starts a backfill.
4. **Email events via a workflow** (recommended alongside step 2):
   - Create a GHL workflow with the trigger *Email Events* and the action *Webhook*.
   - POST to `https://<your-app>/api/webhooks/workflow`.
   - Add the header `x-webhook-secret: <WEBHOOK_SECRET>`.
   - Add custom data: `event`, `location_id`, `contact_id`, `url`, `subject`, `timestamp` (see the comment in that route).
5. **Tag links.** Use **Settings → Link tagger** to make a tracked link (`/r/<id>?c={{contact.id}}`) per email link.
   - This logs a per-contact click whatever GHL reports, then 302s to the UTM-tagged page.
   - Plain UTM links also work if GHL's click events include the URL.

### Things to verify against current GHL docs

These details change over time. Each one is isolated, and most can be overridden by env vars without a code change.

| What | Where | Assumed |
|---|---|---|
| API base / `Version` header | `GHL_API_BASE`, `GHL_API_VERSION` | `services.leadconnectorhq.com`, `2021-07-28` |
| OAuth chooser + token endpoint | `src/server/ghl/client.ts` | `/oauth/chooselocation`, `POST /oauth/token` (form-encoded, `user_type=Location`) |
| Scope names | `GHL_SCOPES` | `contacts.readonly`, `calendars/events.readonly`, `payments/transactions.readonly`, … |
| Sync endpoints + response shapes | `src/server/ghl/sync.ts` | `POST /contacts/search`, `/calendars/events`, `/opportunities/search`, `/payments/transactions`, `/workflows/`, `/campaigns/` |
| Email event payload fields | `normalizeEmailEvent` in `src/server/ghl/mappers.ts` | several aliases accepted |
| Webhook signature headers | `src/server/ghl/signature.ts` | `X-GHL-Signature` (Ed25519), legacy `X-WH-Signature` (RSA) |

There is no reliable bulk API for historical per-contact email events. The backfill therefore imports contacts, appointments, opportunities, payments, workflows and campaigns, and email events accumulate from webhooks once connected.

## How attribution works

The core logic is `src/lib/attribution.ts`, a pure function with unit tests.

- Only **clicks** count; opens are never used.
- A click qualifies when it is the same contact, at or before the conversion, and within the window (7/14/30/60 days, default 14).
- **Last click** (default) credits the latest qualifying click. **First click** credits the earliest.
- Nothing qualifies → **unattributed**. This is shown as a KPI on Campaigns because it measures tracking gaps.
- Payments are revenue. Refunds are negative payments that inherit the original payment's credit.
- Credits live in `attributions`. They are rebuilt for one contact when a click or conversion arrives, and for the whole sub-account when settings change or on the nightly sync. While a rebuild runs, dashboards show a spinner.

## Metric definitions

- Click rate = unique clickers / sent.
- Click-to-open = clickers / openers.
- Booked calls = credited appointments that were not cancelled.
- Show rate = showed / (showed + no-show). Upcoming calls are left out so recent sends aren't penalised.
- Close rate = sales / showed.
- Days to book = mean(booking − contact's first click on the credited email).
- Rev / 1k sent = revenue / sent × 1000.
- Campaigns lists one-off sends. Sequence steps are reported on the Sequences tab.

## Security

- Tokens are encrypted at rest and never sent to the browser.
- Marketplace webhooks are signature-verified. Workflow webhooks use a shared secret. All webhooks are idempotent (`webhook_receipts`, event dedupe keys).
- Public endpoints are rate-limited.
- Logs carry no PII.
- Sessions use magic links with single-use, hashed, 15-minute tokens and a signed HTTP-only cookie.
- Every query is scoped by `location_id`.
- Admins can delete one contact's stored data from Contact journeys (`DELETE /api/contacts/:id`). GHL webhooks for `ContactDelete` do the same.

## Layout

```
src/lib/          pure logic (attribution, metrics, alerts, journey timeline, subject classifier) + tests
src/server/       db access, auth, GHL client/sync/webhooks, reports, alerts, notifications
src/app/api/      route handlers (all scoped to the signed-in user's current sub-account)
src/app/(app)/    pages: campaigns, sequences, segments, health, journeys, overview, emails, more, settings
public/           manifest, service worker, icons (regenerate with `npm run icons`)
scripts/          demo seed, icon generator
```
