# Desktop notices (server-driven announcements)

Show a popup or forced-update page in the desktop app **without shipping a release**. Rows in the `desktop_notices` table are served by `GET /api/desktop/version` and rendered by `DesktopNoticesGate`. The app polls every 30 minutes and on window focus; API failures fail open (no notice).

## Authoring model

A notice is **one markdown body** plus behavioral fields. There is no title field — put the title in the markdown (`### Heads up: …`).

- Markdown supports headings, bold, links, lists, and images. Raw HTML is stripped.
- A leading image (`![alt](https://…)`) renders edge-to-edge at the top of the dialog, card-cover style (capped height, `object-cover`). Host images at any public URL (e.g. Vercel Blob).
- Exception: `blocking` notices render on the full-screen forced-update page, where the body is shown as **plain text** — keep it to a sentence or two, no markdown.

## Creating one

Insert with `active = false`, verify, then flip `active = true` to ship (and back to `false` to pull — no deploy either way):

```sql
INSERT INTO desktop_notices
  (severity, "trigger", max_version, body, cta_label, cta_action, dismissible, active)
VALUES (
  'warning',
  'immediate',
  '1.99.0',
  E'### Heads up: v2.0 has breaking changes\n\nCloud mirrors need re-linking once after you update. [Details](https://superset.sh/changelog)',
  'Update now',
  'install-update',
  true,
  false
);
```

### Field reference

| Field | Values | Behavior |
| --- | --- | --- |
| `severity` | `info` \| `warning` \| `blocking` | Soft severities show the dialog (highest applicable wins). `blocking` replaces the whole app with the forced-update page. |
| `trigger` | `immediate` \| `pre-update` \| `post-update` | `immediate`: dialog on boot/poll. `pre-update`: confirmation popover when the user clicks the update pill. `post-update`: release announcement, shown only to installs that updated into the release (see below). |
| `min_version` / `max_version` | semver or `NULL` | Bounds on the running app version; `NULL` = unbounded. For `post-update`, `min_version` is the announced version — shown only when the previous version was below it (fresh installs never see it). |
| `platforms` | e.g. `'{darwin}'` or `NULL` | Electron `process.platform` values; `NULL` = all. |
| `channels` | `'{stable}'` \| `'{canary}'` \| `NULL` | Canary = prerelease app versions; `NULL` = all. |
| `starts_at` / `ends_at` | timestamptz or `NULL` | Scheduling window. |
| `cta_label` + `cta_action` (+ `cta_url`) | `install-update` \| `open-url` | Optional button next to Dismiss. `open-url` needs `cta_url`. |
| `dismissible` | boolean | Adds a Dismiss button (Esc/outside-click also dismiss). Dismissals persist per install, keyed by row id — a new row shows again. |
| `active` | boolean | Kill switch; defaults to `false`. |

## QA

- **UI only**: dev command palette → `Preview notice: info / warning / blocking / post-update / pre-update` and `Clear notice preview`. Esc exits a blocking preview.
- **DB → API → client**: with the local stack running, `NODE_ENV=development bun run packages/db/src/seed-desktop-notices.ts`, then check the dialog and `GET /api/desktop/version`.

## Production

Writing to the production `desktop_notices` table is a deliberate ops action — the root AGENTS.md database rules apply (never touch prod without explicit confirmation). Insert with `active = false`, verify the JSON at `https://api.superset.sh/api/desktop/version`, then flip `active`.
