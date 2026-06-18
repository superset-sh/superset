# Skill And CLI Management Implementation Plan

## Phase 0: Finalize Product Decisions

- Confirmed: failed audit blocks activation in the MVP.
- Confirmed: one zip contains exactly one capability in the MVP.
- Confirmed: visible Settings label should be "Tools & Skills" unless product
  copy changes later.
- Confirmed: initial import path is zip first; Git URL and local folder/repo
  import can normalize to the same package format.
- Confirmed: Settings UI is a readable capability library for both technical
  and non-technical users, not a raw manifest/package inspector.
- Confirmed: package overview content should prefer manifest `display` fields
  plus Markdown, with README.md or Skill content as fallback.
- Confirmed: user-facing security status should hide audit model/provider
  identifiers. Those ids remain internal audit metadata.
- Confirmed: Automation create/detail should expose a compact Tools & Skills
  picker, while full package inspection and import management stay in Settings.
- Confirmed: Project capability bindings are defaults, and Automation
  capability bindings are pinned runtime inputs.
- Confirmed: Automation agents must be told about selected Tools & Skills
  through both execution environment setup and concise prompt context.

## Phase 1: Schema And Contracts

- Add Drizzle schema for cloud package catalog:
  - `capabilities`
  - `capability_versions`
  - `project_capabilities`
  - `automation_capabilities`
- Ask the user to generate Drizzle migrations after schema changes.
- Add Zod schemas for:
  - common manifest
  - manifest `display` fields
  - Skill manifest extension
  - CLI manifest extension
  - user-facing CLI command/action metadata
  - structured security audit result
  - binding payloads
- Add tests for manifest validation and path safety.

## Phase 2: Package Import And Audit API

- Add cloud router for capability package CRUD.
- Implement zip validation:
  - read root `superset.capability.json`
  - validate type-specific schema
  - normalize paths
  - enforce size/file limits
  - compute sha256
- Implement audit input extraction:
  - manifest
  - file tree
  - Skill content or CLI docs
  - package scripts/install commands
  - shell scripts and executable entrypoints
- Extract user-facing display data:
  - `display.summary`
  - `display.overviewMarkdown`
  - `display.intendedUsers`
  - `display.useCases`
  - README.md or Skill markdown fallback
- Implement audit-model resolver:
  - prefer configured OpenAI/GPT model suitable for security review
  - record actual provider/model on the audit result
  - do not hardcode one model id into schema
- Keep audit provider/model ids available internally but omit them from the
  ordinary Settings UI response or presentation.
- Block package activation until audit passes.
- Store package artifact through a generalized blob/archive upload path.
- Persist immutable version rows.
- Add usage checks for disable/delete.

## Phase 3: Settings UI

- Add Settings section and search registry entries.
- Build `ToolsAndSkillsSettings` page with:
  - tabs or segmented filter for Skills and CLI Tools
  - package list
  - readable details panel
  - Markdown overview tab using the shared `MarkdownRenderer`
  - How to use tab with Skill activation guidance or CLI action cards
  - Configuration & permissions tab for secrets/env, network, file access, and
    runtime install expectations
  - Versions & details tab with visual manifest metadata and advanced raw data
  - import dialog
  - validation result view
  - security badge plus readable report when needed
  - usage and host install status where relevant
- Follow the existing resource settings pattern used by Agents, Projects, and
  Hosts.
- Do not show raw manifest JSON, checksums, file lists, or audit model/provider
  in the default reading path.

## Phase 4: Project And Automation Binding UI

- Add Project defaults UI in v2 Project settings.
- Add a shared Automation Tools & Skills picker that:
  - lists active, audit-passed Skill and CLI packages
  - supports search and Skill/CLI filters
  - shows friendly name, type, security badge, and readable summary
  - hides raw manifest JSON, checksums, install internals, archive paths, and
    audit provider/model ids
  - links to Settings for importing or full package management
- Add the picker to the New Automation dialog's configuration footer as a
  compact control next to device, project, schedule, runner, and model.
- Add a Tools & Skills row to the Automation detail sidebar, showing selected
  chips or count and opening the same picker for editing.
- Store explicit Automation bindings with pinned version ids.
- When creating from a Project context, preselect Project defaults but persist
  Automation-specific selections.
- When the Project context changes after the user edits selected tools, preserve
  explicit user selections unless the user chooses to apply the new Project
  defaults.

## Phase 5: Automation Dispatch

- Extend Automation schemas and router logic to validate selected capability
  versions in the same organization.
- Include selected capability version payloads in dispatch to host-service.
- Keep the dispatch payload explicit: capability id, version id, type, slug,
  name, version, manifest, artifact URL, artifact checksum, config, and display
  order.
- Add concise preflight failure behavior when a selected capability cannot be
  resolved.
- Keep existing Automations working with an empty capability array.

## Phase 6: Host-Service Materialization

- Add materialization module under host-service, called before agent launch.
- Create `capabilities/` directory under `getAutomationExecutionDirectory`.
- Implement Skill materialization by agent/provider where possible.
- Implement CLI install/reuse:
  - verify archive checksum
  - extract into managed package dir
  - install under managed install dir
  - create shims in managed `bin`
  - prepend managed `bin` dirs to `PATH`
  - generate tool docs/manifest
- Inject runtime environment variables such as `SUPERSET_CAPABILITIES_DIR` and
  `SUPERSET_CAPABILITY_MANIFEST` for every Automation agent run.
- Append a concise Available Tools & Skills block to the Automation prompt,
  listing selected Skills, CLI actions, safe command examples, and generated
  docs/manifest paths.
- Add install lock/state to avoid duplicate installs for concurrent runs.
- Update `runs/<runId>.metadata.json` with selected capability versions,
  checksums, materialized paths, and install result.

## Phase 7: Validation

- Backend tests:
  - manifest schema accepts valid Skill and CLI examples
  - unsafe zip paths are rejected
  - failed audit blocks activation
  - audit result records provider/model id
  - duplicate slug/version conflict behavior
  - binding rejects wrong-organization capability versions
  - delete/disable reports usage
- Automation tests:
  - create/update stores pinned capability bindings
  - dispatch includes selected capability versions
  - missing selected package creates concise run-facing failure
- Host-service tests:
  - materialization writes only under Automation directory
  - CLI install is reused on second run
  - PATH contains managed bin dirs
  - run metadata is lightweight and secret-free
  - no global config or global package dir is mutated
- Renderer tests:
  - Settings list/detail/import validation states
  - Markdown overview rendering
  - Skill tabs hide raw manifest by default
  - CLI action cards and configuration labels render from manifest display data
  - security status hides audit model/provider in ordinary UI
  - Project defaults picker
  - New Automation Tools & Skills picker preselects Project defaults
  - Automation detail sidebar displays selected Tools & Skills and edits through
    the same picker
  - Automation picker hides raw manifest/checksum/install internals by default
- Desktop acceptance checks:
  - create dialog shows a compact Tools & Skills control without crowding the
    footer
  - detail sidebar row stays readable with zero, one, and multiple selections
  - selected CLI packages are visible to the launched Automation through `PATH`
    and the Available Tools & Skills prompt block

## Commands To Run During Implementation

- `bun run lint`
- `bun run typecheck`
- Targeted backend tests for `packages/trpc`
- Targeted host-service tests for Automation runner/materialization
- Targeted renderer tests for Settings and Automation UI

## Rollback Points

- Schema migration can be rolled back by dropping new capability tables before
  any Automation references are used.
- Runtime materialization is gated by Automation bindings. Empty bindings must
  preserve existing Automation behavior.
- CLI install can be disabled behind a feature flag while Skill-only package
  management remains active.

## Files And Areas To Watch

- `packages/db/src/schema/schema.ts`
- `packages/trpc/src/router/automation/*`
- new `packages/trpc/src/router/capability/*`
- `packages/host-service/src/trpc/router/agents/agents.ts`
- new host-service materialization module
- `apps/desktop/src/renderer/routes/_authenticated/settings/*`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/*`
- `.trellis/spec/trpc/backend/automation-run-workflow.md`

## Validation Notes

### 2026-06-16 Settings UX Refinement

- `bun test packages/trpc/src/router/capability/package-validation.test.ts`
  passed.
- `bun run lint:fix` completed and fixed formatting.
- `bun run lint` passed.
- `bun run typecheck` passed.
- Desktop Automation checked
  `http://localhost:3165/#/settings/tools-and-skills`.
- Screenshot artifacts:
  - `.trellis/tasks/06-15-skill-cli-management/artifacts/tools-skills-overview.png`
  - `.trellis/tasks/06-15-skill-cli-management/artifacts/tools-skills-details.png`
- Desktop UI verification:
  - Overview tab renders readable Markdown.
  - Configuration tab shows a compact security status and no model/provider id.
  - Versions & details tab visualizes common manifest fields.
  - Checksum, file list, artifact path, and raw manifest are behind
    "Advanced package data".
- Console note: renderer still logs host event websocket connection refused
  errors for unavailable local host event streams; this did not block the
  Tools & Skills Settings page or API-backed capability data.

### 2026-06-17 System Health CLI Upload

- Created and imported `system-health-cli@1.0.1` as a CLI capability package
  for `biang.wua@qq.com` in organization
  `c4653085-9de3-42b9-a21b-cbb3488f3307`.
- The CLI reads CPU load, memory usage, root disk usage, platform, hostname,
  and uptime, and supports Markdown output plus `--json`.
- Fixed the demo CLI disk parser to use `df -kP /` so macOS output renders the
  mount as `/` instead of an extended `df` column.
- Stored artifact:
  `.trellis/tasks/06-15-skill-cli-management/artifacts/system-health-cli.zip`.
- Current DB state:
  `system-health-cli` is active, current version is `1.0.1`, audit status is
  `passed`.
- Desktop UI verification:
  - CLI tab shows `System Health CLI`.
  - Overview renders the manifest Markdown summary.
  - How to use shows the friendly CLI action and `system-health --json`.
- Screenshot artifacts:
  - `.trellis/tasks/06-15-skill-cli-management/artifacts/system-health-cli-overview.png`
  - `.trellis/tasks/06-15-skill-cli-management/artifacts/system-health-cli-how-to-use.png`
- Validation:
  - `bun test packages/trpc/src/router/capability/package-validation.test.ts`
    passed.
  - `bun run lint` passed.

### 2026-06-17 Automation Tools & Skills Binding UI

- Added and verified a shared Automation Tools & Skills picker for create and
  detail flows.
- New Automation dialog verification:
  - The footer shows a compact `No tools` empty state next to device, project,
    schedule, runner, and model controls.
  - Opening the picker lists active audit-passed packages only.
  - `System Health CLI` appears as a CLI with a readable summary and
    `Security passed` badge.
  - `E2E Skill Demo` appears as a Skill with a readable summary and
    `Security passed` badge.
  - Selecting `System Health CLI` updates the footer summary and shows a
    `Selected` group plus `1 selected for this Automation.`
- Automation detail verification:
  - The sidebar `Details` section includes a `Tools & Skills` row.
  - Opening the row shows the same picker and approved package list.
  - No detail binding mutation was performed during this smoke check.
- Screenshot artifacts:
  - `.trellis/tasks/06-15-skill-cli-management/artifacts/automation-tools-picker.png`
  - `.trellis/tasks/06-15-skill-cli-management/artifacts/automation-detail-tools-picker.png`
- Validation:
  - `bun run lint:fix` passed with no remaining fixes.
  - `bun run lint` passed.
  - `bun run typecheck` passed.
- Console note: renderer still logs local host event websocket connection
  refused errors when host event streams are unavailable; this did not block
  Automation list, create picker, detail picker, or API-backed capability data.

### 2026-06-17 Automation Detail Rapid Toggle Race Fix

- Fixed a detail-sidebar race where rapidly toggling multiple Tools & Skills
  could let an older `setAutomationBindings` response overwrite a newer
  selection.
- Automation detail capability saves now:
  - keep the picker immediately responsive through optimistic draft state;
  - serialize capability save requests through a local promise queue;
  - skip stale queued requests when a newer selection supersedes them;
  - only let the latest save update the query cache or clear the optimistic
    draft.
- Desktop verification:
  - Started from the user's observed state with `E2E Skill Demo` selected.
  - Rapidly toggled to `System Health CLI` only, waited more than 8 seconds,
    and confirmed it did not revert to `E2E Skill Demo`.
  - Restored the Automation back to `E2E Skill Demo` only and confirmed
    `System Health CLI` returned to Available.
- Validation:
  - `bun run lint` passed.
  - `bun run typecheck` passed.

### 2026-06-18 Automation CLI Materialization E2E Fix

- Fixed CLI materialization cache reuse after discovering a stale install state
  could be reused even when package-local install artifacts had been deleted.
- Added `installStateVersion: 2` to host-service CLI install state and require
  that version before reusing an install. Legacy install-state files are now
  invalidated and reinstalled automatically.
- Added a regression test that seeds a legacy CLI install state without
  package-local `.superset-python` artifacts and verifies materialization
  reinstalls instead of reusing it.
- Real desktop verification:
  - Ran `Daily SpaceX Twitter Digest` from the c8ae Electron app.
  - New run `e5763406-fc70-4799-81ba-cc1be04cc1f7` moved from Running to
    Completed.
  - Dispatch did not fail with `fetch failed`.
  - The selected `Twitter SpaceX CLI` package was installed under the
    Automation-managed capability directory with `installStateVersion: 2`.
  - `bs4` / `beautifulsoup4` was present under package-local
    `.superset-python`.
  - The agent wrote back a Markdown digest from `twitter-spacex` structured
    output with 40 usable Twitter/X posts.
- Screenshot artifact:
  `.trellis/tasks/06-15-skill-cli-management/artifacts/automation-twitter-completed-fixed.png`.
- Validation:
  - `bunx @biomejs/biome@2.4.2 check --write --unsafe packages/host-service/src/automation-capabilities/materialize.ts packages/host-service/src/automation-capabilities/materialize.test.ts`
    passed.
  - `bun test packages/host-service/src/automation-capabilities/materialize.test.ts`
    passed.
  - `bun test packages/host-service/src/trpc/router/agents/agents.test.ts packages/trpc/src/router/automation/dispatch-workspace-decoupling.test.ts apps/relay/src/tunnel-timeout.test.ts`
    passed.
  - `bun run lint` passed.
  - `bun run typecheck` passed.

### 2026-06-18 Automation Prompt Edit Flow

- Simplified the Automation prompt editing surface after UX review. The prompt
  body no longer shows a separate `Prompt` explainer, saved status indicator, or
  inline `Save prompt` toolbar.
- `Edit prompt` now opens a lightweight edit mode that preserves the source run
  in the URL with `editPrompt=true&runId=<runId>`.
- Edit mode replaces the header actions with `Cancel` and `Save`.
- `Save` writes the prompt to `automations.prompt` when changed, refreshes
  prompt/version queries, and returns directly to the source run detail page.
  If no source run exists, it returns to the latest available run detail.
- `Cancel` discards the draft and returns to the same detail target.
- Cmd/Ctrl+Enter still saves from inside the editor. Blur no longer auto-saves
  this Automation prompt surface.
- Real desktop verification:
  - Opened the c8ae Electron run detail page.
  - Clicked `Edit prompt` and confirmed the simplified edit mode shows only the
    title, editor, and top `Cancel` / `Save` actions.
  - Confirmed the removed `Saved to this Automation...` and `Saved / Save
    prompt` elements are absent.
  - Clicked `Save` and confirmed the app returned to the source run detail
    page.
- Screenshot artifact:
  `.trellis/tasks/06-15-skill-cli-management/artifacts/automation-prompt-edit-simple.png`.
- Validation:
  - `bun run --cwd apps/desktop typecheck` passed.
