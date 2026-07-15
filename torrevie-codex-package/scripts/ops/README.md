# TEX Quick Connect Operations Templates

These files help run the TEX Quick Connect connector on a persistent operations host.

- Preferred managed runtime: Render Background Worker via the repository-root `render.yaml`.
- `torrevie-tex-quick-connect.service`: Linux `systemd` unit template.
- `install-tex-quick-connect-task.ps1`: Windows Task Scheduler registration helper.

Before enabling either template:

1. Fill a protected environment file from `docs/runbooks/tex-quick-connect.env.example`.
2. Keep the filled file outside Git.
3. Confirm the host has persistent encrypted storage for `TEX_QUICK_CONNECT_SESSION_DIR`.
4. Start the connector.
5. Run `pnpm tex:quick-connect:health`.
6. Enable `TEX_QUICK_CONNECT_CONNECTOR_ACTIVE=true` in the customer portal only after health passes.
