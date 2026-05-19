# Team Contributions

This PRD was authored directly from the Linear "Justin" project Cycle 28 issue list rather than through the full kb-prd-plan Claude Agent Team workflow. The phase contributions below are derived from the groomed ticket text Satya Patel produced in Linear (Sat May 16 – Mon May 18, 2026), plus product-manager-style synthesis applied during PRD authoring on 2026-05-19.

## Phase 1 — User Personas

Source: Linear ticket bodies (References sections and grooming comments) plus the originating Slack threads cited there (#founders, #ext-inversionsemi).

- **User** — Day-to-day Superset user in the desktop app. Hits every UC except the explicitly remote-only ones.
- **Remote User** — User running the CLI on EC2 / SSH / Codespace while the browser lives on a different machine. Origin: Daniel Vega (Inversion Semiconductor), #ext-inversionsemi 2026-05-12, surfaced in SUPER-750.
- **Automation Operator** — User configuring and supervising automations. Origin: Kiet Ho / Satya Patel #founders thread 2026-05-14 (SUPER-771) plus Satya's dogfooding screenshot (SUPER-783).
- **Reviewer** — User reading code in the diff viewer (UC-UX-02 / SUPER-804).
- **Engineer (Internal)** — Superset engineering consuming the canonical chat-architecture doc (UC-CHAT-01 / SUPER-751).
- **System** — The Superset runtime (host service, CLI, relay, cloud, desktop main + renderer) — actor for behaviors that happen without direct user input (auth refresh, event emission, accelerator routing).

Pain points consolidated from the tickets:

- "I started a new chat and the assistant message flickered / duplicated" — SUPER-753.
- "My automation just died and I have no idea why" — SUPER-771 (Kiet, #founders 2026-05-14).
- "I picked 'New workspace' and nothing happened" — SUPER-783 (Satya dogfooding).
- "I tried `superset auth login` over SSH and it broke" — SUPER-750 (Daniel Vega, #ext-inversionsemi 2026-05-12).
- "The host service silently 401s after an hour" — SUPER-752.
- "Cmd+W just closed everything I had open" — SUPER-794.
- "Line numbers in the diff are out of order" — SUPER-804.
- "`/login` doesn't actually log in" — SUPER-754.
- "Three buttons on the composer is too many" — SUPER-755.

## Phase 2 — Architecture

Source: the Linear ticket bodies' Implementation notes / Files / Approach sections, which already trace each problem to specific file:line locations and propose a fix path.

- **System components** identified across the in-scope packages: `packages/chat` (server + client + shared), `packages/host-service` (auth provider, tunnel, trpc router), `packages/cli` (commands/auth/login, lib/auth, lib/host/spawn, lib/resolve-auth), `packages/trpc` (cloud chat router, automation router), `apps/desktop` (renderer chat panes, browser panes, automations UI, diff viewer, main-process menu).
- **Data entities** identified: `ChatEvent`, `ChatSession` (`chat_mastra_sessions`), `Automation`, `AutomationRun`, `AuthSession` / OAuth tokens.
- **API / IPC endpoints**: `session.watch`, `workspace.watch`, `session.applyEvent`, `session.replayEvents`, `automation.create`, `automation.dispatch`, `workspaces.create` (relay), `auth.login` (CLI), refreshable host-service `getSessionToken`.
- **External dependencies**: Electron, tRPC (with `trpc-electron` observable-only constraint), Mastracode harness event stream, Ink + @clack/prompts, OAuth provider, react-hotkeys-hook, Drizzle / Neon, the relay tunnel.

## Phase 3 — UI Infrastructure

Source: the existing v2 chat composer + slash command + diff viewer + automations UI surfaces referenced in the tickets.

- **Design libraries / reuse**: `ChatComposerControls`, `ModelPicker`, `PermissionModePicker`, `ThinkingToggle`, `PromptInputTools`, `SlashCommandMenu`, `SlashCommandPreviewPopover`, `WorkspacePicker`, `PreviousRunsList`, `CreateAutomationDialog`, `AutomationDetailSidebar`, `BrowserPane` / `usePersistentWebview`, the diff-viewer component (file under `apps/desktop`), and `LoginUI` (Ink) / `@clack/prompts` fallback for CLI.
- **Style tokens**: `PILL_BUTTON_CLASS` (composer pill styling) — relevant for UC-CHAT-03 only; the consolidated menu's trigger reuses the same pill family.
- **Component reuse**: UC-CHAT-03 explicitly reuses `ModelPicker`, `PermissionModePicker`, `ThinkingToggle` internals rather than rewriting them. UC-AUTO-01 reuses `PreviousRunsList.tsx` (replaces clipped-tooltip affordance only).

## Phase 4 — Holdout Scenarios

Holdout scenario generation (per `brain/docs/kanban/holdout-scenarios.md`) is deferred — this PRD was authored quickly from existing groomed tickets. Recommended follow-up: run `kb-sprint-tasks-plan` against each UC to derive sprint-level scenarios and write them under `.spec/scenarios/{uc-id}/*.scenario.md` before the sprint's first PR opens.

## Authoring Notes

- All ten tickets in Linear's "Justin" project / Cycle 28 issue list are mapped 1:1 to a use case in this PRD per user request ("add a usecase for each tasks").
- Two related tickets surfaced during reading but are intentionally not landed in this PRD:
  - **SUPER-787 "PRD for Chat"** — meta-ticket asking for this PRD; marked Done in Linear because this document is the deliverable.
  - **SUPER-789 "Automations needs to be productized"** — explicit follow-up beyond the failure-surfacing scope; deferred per UC-AUTO-01 / UC-AUTO-02 framing.
