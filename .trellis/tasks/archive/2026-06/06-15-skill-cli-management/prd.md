# Skill and CLI management

## Goal

Add a Settings-managed capability library for Skills and CLI tools. Users can
import a zip package, Git repository, or local folder, Superset normalizes it
into a versioned package with a Superset-defined manifest, and Projects /
Automations can opt into the packages they need.

The first implementation should be a management surface, not a Skill editor.
Users inspect, validate, import, update, delete, and bind packages. Runtime
installation/materialization happens on demand in the consumer's execution
directory.

## User Value

- A user can keep reusable agent context and executable tools in one account
  library instead of copying instructions or reinstalling CLIs into every
  Automation.
- Projects can advertise default capabilities for their work.
- Automations can pin the exact Skill and CLI versions they need, install them
  once under the Automation-owned directory, and reuse that install on later
  runs.
- Automation authors can choose reusable Skills and CLI tools while creating or
  editing a scheduled task, without leaving the Automation workflow or reading
  package internals.
- Runs remain reproducible because run metadata records the capability version,
  checksum, and materialized paths used by the agent.

## Confirmed Facts

- Multica models Skills as workspace-level resources, then binds them to
  Agents through a junction table. Relevant files:
  `/tmp/multica.NJLaRM/multica/server/migrations/008_structured_skills.up.sql`
  and `/tmp/multica.NJLaRM/multica/server/pkg/db/queries/skill.sql`.
- Multica runtime materializes selected Skills into provider-native scan paths
  such as `.claude/skills`, `.opencode/skills`, `.agents/skills`, and a
  Codex-specific per-task home. Relevant file:
  `/tmp/multica.NJLaRM/multica/server/internal/daemon/execenv/context.go`.
- Superset Automations already have `agent`, model selection,
  `targetHostId`, `v2ProjectId`, and `mcpScope`, but no Skill or CLI binding.
  Relevant files: `packages/db/src/schema/schema.ts`,
  `packages/trpc/src/router/automation/schema.ts`, and
  `packages/trpc/src/router/automation/automation.ts`.
- The Automation workflow spec already says future Skill, CLI, MCP, model,
  attachment, and project context must materialize under
  `~/.superset[/dev]/automations/<automationId>` or
  `SUPERSET_AUTOMATION_RUNS_DIR/<automationId>`, never under user-global tool
  config directories. Relevant file:
  `.trellis/spec/trpc/backend/automation-run-workflow.md`.
- Host-service already runs Automations from a stable Automation directory and
  writes per-run artifacts under `runs/<runId>.*`. Relevant file:
  `packages/host-service/src/trpc/router/agents/agents.ts`.
- Settings already has resource-style areas for Agents, Projects, Hosts, and
  Models. A new capability management page should fit that pattern instead of
  being hidden inside the Automation detail sidebar.

## Requirements

### Capability Library

- Add a Settings resource area for capability management. Product label can be
  "Tools & Skills" or "Capabilities"; the UI must visibly separate Skill
  packages from CLI tool packages.
- Store packages at organization/account scope so the same library is shared by
  Projects, Workspaces, and Automations in the account.
- Support import from zip first. Git URL and local folder/repo import should
  normalize to the same zip package format before persistence.
- MVP package boundary is one zip per capability. A zip contains exactly one
  Skill package or one CLI package, not a mixed bundle.
- Require a root manifest named `superset.capability.json` for first-party
  packages. The importer may later support aliases, but the canonical format
  should be explicit.
- The manifest must separate runtime metadata from user-facing display
  metadata. Runtime fields drive install/materialization; display fields drive
  the Settings UI for non-technical users.
- Support a `display` section in the manifest for readable summaries,
  Markdown overview content, intended users, use cases, and friendly command or
  workflow labels. README/SKILL.md content may be used as long-form overview
  fallback, but the preferred source is manifest `display` plus Markdown.
- Validate manifest, package type, path safety, file count, package size, and
  checksum before adding a package to the library.
- Run a mandatory model-based security audit before any Skill or CLI package
  becomes available in the library. The audit should use the organization's
  configured provider/model policy for security review, with an OpenAI/GPT
  model preferred when available. The selected provider/model must be recorded
  internally with the audit result instead of hardcoding a model name in the
  schema. The normal Settings UI must not show the selected model.
- Show a readable package summary, Markdown overview, friendly usage
  instructions, configuration needs, security status, usage, and version
  details. Raw manifest JSON, checksum, and file lists belong behind an
  advanced/details area, not in the default reading path.
- Support update-from-source by creating a new immutable version. Existing
  Project and Automation bindings should stay pinned unless the user updates
  them.
- Support delete/disable with usage checks. A package version in use by an
  Automation should not disappear silently.

### Settings UX

- The Settings page is a reusable capability library, not a developer-only
  package inspector.
- The primary audience includes non-developers such as teachers, operators,
  researchers, and creators. A user should understand whether a Skill or CLI is
  useful without reading command-line details, raw JSON, checksums, or archive
  internals.
- The detail page should use clear sections or underline tabs instead of one
  long mixed page. Recommended tabs are:
  - Overview: Markdown-rendered introduction, use cases, intended users, and
    examples.
  - How to use: Skill activation and target agents, or CLI actions presented as
    friendly command cards.
  - Configuration & permissions: required secrets/env by human-readable label,
    network access, workspace file access, and install/runtime expectations.
  - Versions & details: visualized manifest fields, source, versions, usage,
    files, checksums, and raw manifest behind an advanced disclosure.
- The list view should prioritize name, type, short description, active state,
  security status, and usage count. Slugs, checksums, and raw version internals
  should not dominate the list.
- Security audit appears as a compact status badge in the main UI. Details are
  shown only when failed, warning, pending, or explicitly opened by the user.
  Provider/model identifiers are hidden from the normal user-facing view.

### Skill Packages

- A Skill package is static agent context, usually rooted at a `SKILL.md` plus
  supporting files.
- Skill packages should expose a readable Markdown overview in Settings. The
  preferred source is manifest `display.overviewMarkdown`; README.md or
  `skill/SKILL.md` may be used as a fallback or long-form source.
- Runtime materialization should write Skills into the selected agent's native
  discovery path when known, with a neutral fallback manifest for unsupported
  agents.
- Do not build a visual Skill editor in the initial scope.

### CLI Tool Packages

- A CLI package is executable tooling the agent may call through `PATH` or a
  generated tool brief.
- CLI tools must install into a Superset-managed directory under the consumer
  context, not into user-global locations such as `/usr/local/bin`, `~/.npm`,
  or `~/.cargo`.
- Automations should install a selected CLI package once per
  Automation/host/version and reuse it on subsequent runs when the checksum and
  manifest still match.
- The agent run should receive a managed `PATH` prepend and a generated
  `tools.md`/manifest describing available commands, examples, and required
  environment variables.
- CLI manifests must declare required secrets/environment variables by name
  only. Secret values must come from existing secure project/org/automation
  secret mechanisms or a future binding UI, never from the package archive.
- CLI packages must present commands as user-facing actions in Settings. The UI
  should explain what the tool can do and what configuration it needs before
  exposing raw command examples or install details.

### Binding Scope

- Project bindings are defaults: they say "this project usually wants these
  capabilities."
- Automation bindings are actual runtime input: they say "this Automation will
  materialize these exact capability versions."
- When creating an Automation from a Project, preselect the Project defaults,
  but store explicit Automation bindings so future Project changes do not
  silently alter scheduled runs.
- The Automation detail sidebar should expose a compact "Capabilities" row or
  picker. The full management experience stays in Settings.

### Automation Tools & Skills UX

- The New Automation dialog should expose a compact "Tools & Skills" control in
  the same configuration area as device, project context, schedule, runner, and
  model. It should summarize the selected count or selected names rather than
  showing package internals in the footer.
- The Automation picker should list active, audit-passed Skill and CLI packages
  from the account library with search and type filters. Each row should show a
  friendly name, readable summary, package type, and compact security status.
  Raw manifest fields, checksums, archive paths, install commands, and audit
  model/provider ids must stay out of the default picker view.
- When a Project context is selected during Automation creation, its default
  capability selections should be preselected. The Automation save payload must
  still persist explicit pinned Automation bindings so later Project default
  changes do not silently alter scheduled run behavior.
- The Automation detail sidebar should show a compact "Tools & Skills" row with
  selected chips or a count, plus an edit action that opens the same picker used
  by creation. An empty state should read as "No tools selected" or equivalent
  product copy, with a route to Settings only for full package management.
- The Automation UI should keep Settings as the place for package inspection,
  import, disable/delete, version history, raw manifest, file list, and advanced
  package details. Automation screens only choose which approved packages this
  task may use.

### Runtime And Reproducibility

- Host-service materializes selected capabilities under:
  `~/.superset[/dev]/automations/<automationId>/capabilities`.
- Host-service should expose selected CLI packages by prepending managed
  capability `bin` directories to the Automation agent's `PATH`, so the agent
  can call approved commands directly without global installs.
- Host-service should expose selected capabilities through environment
  variables such as `SUPERSET_CAPABILITIES_DIR` and
  `SUPERSET_CAPABILITY_MANIFEST`, pointing at the managed capability directory
  and generated manifest for the current Automation.
- The Automation prompt delivered to the agent should include a concise
  "Available Tools & Skills" block. It should list selected Skills, selected CLI
  actions, safe command examples, and paths to generated tool docs/manifests.
  It should not inline raw package archives, secret values, or full manifest
  JSON by default.
- Per-run metadata under `runs/<runId>.metadata.json` must include the
  selected capability ids, version ids, checksums, install paths, and any
  preflight errors.
- A missing or invalid selected capability should fail or skip the run with a
  concise preflight reason. It must not silently fall back to user-global tools.
- Install/materialization should be idempotent and concurrency-safe for
  repeated scheduled runs.

### Safety

- Treat imported CLI packages as executable code. The UI must show install/run
  commands and requested permissions before trust/enable.
- Treat imported Skill packages as potentially prompt-injection-bearing content.
  Skill packages also require the same pre-admission security audit.
- Do not activate a package version until its security audit passes. Failed
  audits should produce a visible report and leave no active package version
  available for Project or Automation binding.
- Security status in the normal UI should be a readable badge such as passed,
  failed, pending, or needs review. The audit model/provider must not be shown
  in the ordinary Settings detail view.
- Validate archive paths to reject absolute paths, `..`, unsafe symlinks, and
  writes outside the managed directory.
- Keep capability artifacts and install caches out of per-run folders except
  for lightweight run snapshots.
- Do not store raw secrets in package manifests, package archives, run
  metadata, or generated tool docs.

## Acceptance Criteria

- [ ] Settings has a capability management surface with Skill and CLI views,
      import actions, search/filtering, readable details, usage, and
      delete/disable states.
- [ ] Skill and CLI detail pages are organized into clear sections/tabs and do
      not mix overview, usage, configuration, security, and advanced technical
      data in one undifferentiated page.
- [ ] The default detail view is understandable to non-technical users. Raw
      manifest JSON, checksums, file lists, and install internals are hidden in
      an advanced/details area.
- [ ] Skill and CLI details render a readable Markdown overview using manifest
      display fields, README.md, or Skill content fallback.
- [ ] Common manifest fields are visualized as labeled metadata instead of
      showing raw JSON by default.
- [ ] A zip with `superset.capability.json` can be imported, validated, stored
      as an immutable version, and displayed in the library.
- [ ] Invalid packages fail validation with actionable messages and do not
      create partial catalog rows.
- [ ] Every imported Skill and CLI package is audited by the configured
      provider model before activation. The user-facing UI shows only the
      security status and readable report, not the model/provider identifiers.
- [ ] Packages that fail audit cannot be selected by Projects or Automations.
- [ ] CLI tools are presented as friendly actions with descriptions, examples,
      required configuration, and permissions before raw commands or install
      details are shown.
- [ ] Projects can store default capability selections.
- [ ] The New Automation dialog has a compact Tools & Skills selector that can
      search/filter approved Skills and CLI packages and save selected pinned
      versions.
- [ ] Selecting a Project while creating an Automation preselects that Project's
      default capability bindings, then persists explicit Automation bindings on
      create.
- [ ] Automations can store pinned capability selections independent of Project
      defaults.
- [ ] Automation detail shows the selected Tools & Skills in the sidebar and can
      edit them through the same non-technical picker without exposing raw
      package internals.
- [ ] Automation dispatch passes pinned capability versions to host-service.
- [ ] Host-service materializes Skill packages into the selected runtime path
      and CLI packages into a managed Automation capability directory.
- [ ] Automation agent runs receive a clear Available Tools & Skills prompt
      block plus environment variables and `PATH` entries for selected CLI
      commands.
- [ ] A subsequent Automation run reuses an existing matching CLI install
      instead of reinstalling.
- [ ] Run metadata records capability ids, versions, checksums, and paths
      without copying full packages or secrets into each run directory.
- [ ] If a selected package is missing, checksum-invalid, or cannot be
      installed, the run records a concise preflight failure instead of falling
      back to global tools.
- [ ] Unit tests cover manifest validation, binding validation, Automation
      dispatch payloads, host-service materialization, cache reuse, and
      secret-free metadata.

## Notes

- This is a complex cross-layer feature. It requires `design.md` and
  `implement.md` before implementation starts.
- Do not manually edit generated Drizzle migration files. Schema changes belong
  in `packages/db/src/schema`, then the user should generate migrations.
- Existing terminology conflict: `capabilities` is already a JSON field on
  model provider models. Product terminology can still use "Capabilities", but
  DB table names should be specific enough to avoid confusion.

## Out Of Scope For Initial Implementation

- A rich Skill editor.
- A public marketplace.
- Automatic secret value capture inside package archives.
- Full sandboxing of arbitrary CLI code.
- Silent installation into user-global package managers or global PATH.
- Multi-package bundles.

## Decisions

- Package import must run a model-based audit before activation.
- Failed audit blocks activation in the MVP.
- One zip contains exactly one capability in the MVP.
- Recommended Settings label is "Tools & Skills"; backend terminology can use
  capability/capability package where it improves architecture.
