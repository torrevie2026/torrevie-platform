# TEX Quick Connect Connector

Quick Connect uses a persistent WhatsApp linked-device socket to generate pairing QR codes and receive inbound messages. It is not suitable for normal Vercel serverless request handling because the socket must stay alive beyond a single HTTP request.

## Run Command

```bash
pnpm tex:quick-connect:connector
```

Health check:

```bash
pnpm tex:quick-connect:health
```

## Required Environment

```bash
DATABASE_URL=postgres://...
TORREVIE_DATABASE_SSL=true
TORREVIE_DATABASE_SSL_REJECT_UNAUTHORIZED=false
```

If a direct database URL is not available, the connector can use Supabase REST:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
```

Optional:

```bash
TEX_QUICK_CONNECT_TENANT_ID=<tenant_uuid>
TEX_QUICK_CONNECT_SESSION_DIR=.tex-quick-connect-sessions
TEX_QUICK_CONNECT_POLL_MS=5000
TEX_QUICK_CONNECT_MAX_SESSIONS=5
TEX_QUICK_CONNECT_HEARTBEAT_MS=30000
TEX_QUICK_CONNECT_HEALTH_WINDOW_SECONDS=120
TEX_QUICK_CONNECT_INSTANCE_ID=tex-qc-prod-01
TEX_QUICK_CONNECT_LOG_LEVEL=info
```

Use `docs/runbooks/tex-quick-connect.env.example` as the non-secret template for the protected runtime host environment file.

The customer portal must keep this disabled until the persistent connector is running:

```bash
TEX_QUICK_CONNECT_CONNECTOR_ACTIVE=false
```

Set `TEX_QUICK_CONNECT_CONNECTOR_ACTIVE=true` in the customer portal environment only after the connector is deployed, has database access, and has written a test `quick_connect.connector_started` event.

## What The Connector Does

- Watches `public.tex_quick_connect_sessions` for `qr_pending` sessions.
- Starts a WhatsApp linked-device socket for each pending tenant.
- Writes the scannable QR data URL into `qr_code_data`.
- Updates the session to `connected`, `disconnected`, or `failed`.
- Records lifecycle events in `public.tex_quick_connect_events`.
- Emits `quick_connect.connector_heartbeat` events while a tenant socket is active.
- Stores WhatsApp auth state under `.tex-quick-connect-sessions/`, which is ignored by Git.

## Dependency Justification

- `@whiskeysockets/baileys`: provides the WhatsApp linked-device socket and QR pairing protocol.
- `qrcode`: converts WhatsApp pairing payloads into scannable QR image data URLs.
- `pino`: provides structured runtime logs for connector supervision and incident review.

## Operational Notes

- Run only one connector instance for a tenant at a time.
- Keep the runtime on a stable machine with persistent disk.
- Do not commit `.tex-quick-connect-sessions/`.
- Do not run this as a Vercel serverless function. WhatsApp linked-device pairing needs a long-lived WebSocket and persistent auth files.
- Do not enable the customer portal pairing button until the connector process is supervised and restartable.
- If the WhatsApp phone logs out or removes the linked device, request a new pairing from the TEX Integrations page.
- Inbound media is recorded as WhatsApp submission metadata first; full receipt-file persistence and OCR can be promoted after QR pairing is verified end to end.

## Activation Checklist

1. Provision a persistent runtime with encrypted disk for `.tex-quick-connect-sessions/`.
2. Configure either `DATABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`.
3. Start `pnpm tex:quick-connect:connector`.
4. Confirm the log prints `TEX Quick Connect connector starting`.
5. Confirm `public.tex_quick_connect_events` receives `quick_connect.connector_started` and `quick_connect.connector_heartbeat` rows after a pairing request.
6. Run `pnpm tex:quick-connect:health` and confirm it returns a recent heartbeat.
7. Set `TEX_QUICK_CONNECT_CONNECTOR_ACTIVE=true` in the customer portal environment.
8. Redeploy the customer portal.
9. Request pairing from `TEX > Integrations` and scan the QR from WhatsApp Linked Devices.

## Render Background Worker Deployment

The repository root contains `render.yaml`, which provisions one Render Background Worker:

- Service name: `torrevie-tex-quick-connect`
- Runtime: Node
- Root directory: `torrevie-codex-package`
- Start command: `pnpm tex:quick-connect:connector`
- Persistent disk: `/var/lib/torrevie/tex-quick-connect-sessions`

Render setup:

1. Push the branch containing `render.yaml` to GitHub.
2. Open the Render Dashboard.
3. Select `New > Blueprint`.
4. Connect the Torrevie repository.
5. Confirm Blueprint path: `render.yaml`.
6. Confirm service type is `worker`.
7. Confirm the disk mount path is `/var/lib/torrevie/tex-quick-connect-sessions`.
8. Provide secret env values when prompted.

Secret values prompted by Render:

```bash
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Use either `DATABASE_URL` or the Supabase REST pair. Prefer `DATABASE_URL` when available. Do not put these values in Git.

After the first deploy:

```bash
pnpm tex:quick-connect:health
```

If the health check passes, set this in Vercel production for the customer portal:

```bash
TEX_QUICK_CONNECT_CONNECTOR_ACTIVE=true
```

Then redeploy `app.torrevie.com`.

## Linux Supervisor Example

Use `scripts/ops/torrevie-tex-quick-connect.service` as the checked-in template on the existing Torrevie operations host. Keep the real environment values outside Git, for example in `/etc/torrevie/tex-quick-connect.env`.

```ini
[Unit]
Description=Torrevie TEX Quick Connect Connector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/torrevie/torrevie-codex-package
EnvironmentFile=/etc/torrevie/tex-quick-connect.env
ExecStart=/usr/bin/pnpm tex:quick-connect:connector
Restart=always
RestartSec=10
User=torrevie
Group=torrevie

[Install]
WantedBy=multi-user.target
```

Operational commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now torrevie-tex-quick-connect
sudo journalctl -u torrevie-tex-quick-connect -f
```

## Windows Task Scheduler Example

For a Windows operations host, use `scripts/ops/install-tex-quick-connect-task.ps1` from a protected account with a persistent working directory:

```powershell
.\scripts\ops\install-tex-quick-connect-task.ps1 `
  -RepoPath "D:\Torrevie\Torrevie_Codex_Package\torrevie-codex-package"
```

## Rollback

1. Set `TEX_QUICK_CONNECT_CONNECTOR_ACTIVE=false` in the customer portal environment.
2. Redeploy the customer portal so tenants cannot request new linked-device pairings.
3. Stop the connector process.
4. Keep `.tex-quick-connect-sessions/` for investigation unless a security incident requires revocation.
