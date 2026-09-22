# Desktop error handling: CDP verification

Tested the `ripple-hardcover` worktree against its running Electron app at
`http://localhost:4845`, CDP `9457`, and API `4841`. The app restored a signed-in
session with an active organization. It started on `/new-workspace`.

## Summary

- Visited all 59 generated route templates. This is route coverage, not exhaustive
  coverage of every record, permission level, feature flag, or interaction.
- Clicked through all 24 visible settings sections and the main dashboard pages.
  Opened an existing local workspace, reloaded it, and returned to the list.
- Exercised route/root/provider/error-screen failures, dashboard containment,
  long diagnostics, French translations, 404 recovery, and boot recovery through
  CDP. Faults were injected into responses from this worktree's dev server;
  application files were not modified to trigger them.
- Captured screenshots and layout measurements. Inspected failure screenshots
  individually and all settings screenshots as a contact sheet.
- No renderer crashes or React context/update-loop errors were observed during
  the normal settings/navigation sweep. Some data states were unavailable, as
  listed below.

## Failures found and fixed

1. **Dashboard error messages could hide recovery.** At a 400×400 viewport, a
   33,000-character message placed the heading at y=-29,842 and recovery buttons
   around y=30,250. The content fallback now scrolls, caps the diagnostic height,
   and puts recovery first. The identical injected failure now places the heading
   at y=80 and both actions within the viewport; clicking Go home recovers.
2. **The pre-React boot screen had no recovery button.** Added a localized native
   Reload button before the diagnostics. The boot fixture verifies it without
   React providers, and the CDP boot-failure recheck confirmed Reload restores the app.

The existing router fallback bug was also reproduced in this running app by
reenabling TanStack's old global fallback and crashing the route error page: its
heading appeared at y=8. With the refactor enabled, the same secondary error uses
the desktop emergency layout, with content below y=48 and a working Reload action.
This reproduces the reported failure class, not the original unknown trigger.

## Failure and recovery checks

| Scenario | Result |
| --- | --- |
| Root layout render failure | Title-bar clearance; details toggle; Go home recovers |
| Root loader failure | Original diagnostic shown; details toggle; Go home recovers |
| Essential provider failure | Provider-free emergency fallback; Reload recovers |
| Error page itself throws | Emergency fallback; Reload recovers |
| 33,000-character root error at 400×400 | No horizontal overflow; actions visible; Reload recovers |
| 33,000-character emergency error at 400×400 | Diagnostics bounded; Reload recovers |
| Copy error details | Clipboard matched the original diagnostic; previous clipboard restored |
| French root and emergency errors | French heading/recovery; Reload recovers; persisted language unchanged |
| Dashboard content failure | Sidebar remains available; Go home recovers |
| Dashboard fallback also throws | Escalates to the full-window fallback; Go home recovers |
| Long dashboard error at 400×400 | Failed before fix; passed after fix |
| Unknown route at normal and 400×400 sizes | 404 visible below chrome; Go back home recovers |
| Nested legacy-project 404 | Full-window 404 rendered after loader settled |
| Pre-React boot failure | Title-bar clearance; new Reload button restores the app |
| Workspace reload/navigation | Existing local workspace reopens; return to list works |

Small-size CDP cases used viewport emulation. The earlier isolated Electron test
also exercised physical 400×400 windows; this run adds the real app shell and data.

## Remaining findings and coverage limits

- **New Workspace is not usable at 400×400 with the expanded sidebar.** Its main
  heading was measured at y=-122 and the prompt cards were crowded/clipped. This
  is a separate normal-page responsive layout issue, left unchanged here.
- **Plugins** consistently displays its connection-error state. Its successful
  catalog/detail state could not be verified in this environment.
- **Cloud access** requests returned authorization failures. No cloud provisioning,
  destructive actions, payments, account changes, or external messages were made.
- Some route checks use missing identifiers to exercise empty/error states. Those
  do not prove successful resource-detail flows. Signed-out and onboarding pages
  redirect for this account, so their first-run states remain unverified.
- Programmatic route smoke checks used the app's persistent history because raw
  hash changes do not drive this router. They are distinguished from UI navigation
  below. Early pending snapshots were rechecked after settling: pull requests and
  usage history loaded, the legacy workspace redirected, and the legacy project
  showed 404.

Raw scripts, per-case JSON measurements, and screenshots are in
`/tmp/ripple-cdp-audit/`. Key evidence: `fault-baseline.png`, `fault-root.png`,
`fault-secondary.png`, `dashboard-long-before.png`, `fault-dashboard-long.png`,
`settings-contact.png`, and `new-workspace-small.png`.

## Route inventory

| Route template | Coverage | Result |
| --- | --- | --- |
| `/` | Programmatic route smoke | Rendered without a renderer crash |
| `/onboarding` | Programmatic route smoke | Redirected for the existing signed-in account; first-run/signed-out form not exercised |
| `/settings` | Programmatic route smoke | Redirect passed |
| `/create-organization` | Programmatic route smoke | Rendered without a renderer crash |
| `/sign-in` | Programmatic route smoke | Redirected for the existing signed-in account; first-run/signed-out form not exercised |
| `/automations` | UI navigation | Rendered without a renderer crash |
| `/pages` | UI navigation | Rendered without a renderer crash |
| `/plugins` | UI navigation | Connection error UI; successful plugin-data state blocked |
| `/pull-requests` | UI navigation | Rendered without a renderer crash |
| `/tasks` | UI navigation | Rendered without a renderer crash |
| `/settings/hosts` | UI navigation | Rendered without a renderer crash |
| `/settings/projects` | UI navigation | Rendered without a renderer crash |
| `/settings/usage` | UI navigation | Rendered without a renderer crash |
| `/v2-workspace/$workspaceId` | UI navigation | Rendered without a renderer crash |
| `/new-workspace` | UI navigation | Rendered without a renderer crash |
| `/v2-workspaces` | UI navigation | Rendered without a renderer crash |
| `/workspace` | Programmatic route smoke | Legacy route redirected to the v2 entry page |
| `/workspaces` | Programmatic route smoke | Rendered without a renderer crash |
| `/onboarding/project` | Programmatic route smoke | Redirected for the existing signed-in account; first-run/signed-out form not exercised |
| `/settings/account` | UI navigation | Rendered without a renderer crash |
| `/settings/agent-accounts` | UI navigation | Rendered without a renderer crash |
| `/settings/agents` | UI navigation | Rendered without a renderer crash |
| `/settings/api-keys` | UI navigation | Rendered without a renderer crash |
| `/settings/appearance` | UI navigation | Rendered without a renderer crash |
| `/settings/behavior` | UI navigation | Rendered without a renderer crash |
| `/settings/billing` | UI navigation | Rendered without a renderer crash |
| `/settings/browser` | UI navigation | Rendered without a renderer crash |
| `/settings/connections` | UI navigation | Rendered without a renderer crash |
| `/settings/environments` | UI navigation | Rendered without a renderer crash |
| `/settings/experimental` | UI navigation | Rendered without a renderer crash |
| `/settings/git` | UI navigation | Rendered without a renderer crash |
| `/settings/integrations` | UI navigation | Rendered without a renderer crash |
| `/settings/keyboard` | UI navigation | Rendered without a renderer crash |
| `/settings/links` | UI navigation | Rendered without a renderer crash |
| `/settings/organization` | UI navigation | Rendered without a renderer crash |
| `/settings/permissions` | UI navigation | Rendered without a renderer crash |
| `/settings/presets` | Programmatic route smoke | Redirect passed |
| `/settings/ringtones` | UI navigation | Rendered without a renderer crash |
| `/settings/security` | UI navigation | Rendered without a renderer crash |
| `/settings/teams` | UI navigation | Rendered without a renderer crash |
| `/settings/terminal` | UI navigation | Rendered without a renderer crash |
| `/automations/$automationId` | Programmatic route smoke | Missing-record state rendered |
| `/pages/$slug` | Programmatic route smoke | Missing-record state rendered |
| `/plugins/$pluginName` | Programmatic route smoke | Connection error UI; successful plugin-data state blocked |
| `/project/$projectId` | Programmatic route smoke | Local legacy record absent; 404 rendered after loader settled |
| `/pull-requests/$prNumber` | Programmatic route smoke | Missing-project prerequisite message rendered |
| `/tasks/$taskId` | Programmatic route smoke | Missing-record state rendered |
| `/workspace/$workspaceId` | Programmatic route smoke | Legacy route redirected to the v2 entry page |
| `/settings/agents/$agentId` | Programmatic route smoke | Rendered without a renderer crash |
| `/settings/billing/plans` | Programmatic route smoke | Rendered without a renderer crash |
| `/settings/hosts/$hostId` | Programmatic route smoke | Rendered without a renderer crash |
| `/settings/projects/$projectId` | Programmatic route smoke | Rendered without a renderer crash |
| `/settings/teams/$teamId` | Programmatic route smoke | Missing-ID empty team state rendered; not a successful team-data check |
| `/settings/usage/resources` | Programmatic route smoke | Rendered without a renderer crash |
| `/settings/usage/workspaces` | Programmatic route smoke | Rendered without a renderer crash |
| `/tasks/issue/$issueNumber` | Programmatic route smoke | Missing-project prerequisite message rendered |
| `/tasks/pr/$prNumber` | Programmatic route smoke | Redirect passed |
| `/settings/usage/model/$modelKey` | Programmatic route smoke | No-data state rendered |
| `/settings/usage/workspace/$workspaceName` | Programmatic route smoke | No-data state rendered |

## Follow-up boundary check

After extracting `DashboardContentBoundary` and switching its reset to the
router's navigation commit marker, rechecked the same signed-in worktree on
renderer port 4845 / CDP 9457. Injected dashboard content failures preserved the
sidebar; a throwing content fallback escalated to the full-window screen with
48px title-bar clearance. A 33,000-character diagnostic at 400×400 kept the
heading at y=80 and both recovery actions visible. Real Go-home clicks recovered
all three cases. Screenshots were captured; the small-window screenshot was
visually inspected. Results: `/tmp/ripple-cdp-audit/second-pass-faults.json`.
Sibling-route reset timing is additionally covered by the automated integration
test using the production boundary; the CDP checks here exercised Go home.

## Issue #7648: Machine resources tooltip crash

Followed Settings → Usage → Machine resources using real CDP input on this
worktree (renderer 4845, CDP 9457, signed-in session). At 1100×760, allowed 15
seconds of live sampling, then attempted 20 cursor moves across the charts and
20 manual refresh clicks over 20 seconds.

Both the pre-PR renderer source (`29ed948df3`) and initial PR (`31440ef780`)
crashed after the first refresh/cursor sequence. The captured stack identifies
`RangeError: Invalid time value` in `ResourceSparkline`'s tooltip label formatter.
`ChartTooltipContent` passes the configured series text as its first formatter
argument, not the timestamp; converting it with `Number` produces `NaN`.

The fix reads `payload[0].payload.at`, validates the timestamp, and omits the time
label for absent/invalid samples. The identical CDP sequence then completed all
20 refresh clicks and 20 cursor moves with no captured console errors, no error
screen, and live metrics still visible. Regression tests cover configured text
labels, missing payloads, and invalid/out-of-range dates. Before and after
screenshots were captured and visually inspected:
`/tmp/ripple-cdp-audit/issue7648-before.png` and
`/tmp/ripple-cdp-audit/issue7648-fixed.png`; matching JSON files contain results.

This reproduces a real whole-window crash in the reported view without fault
injection. It does not reproduce the secondary `useLingui` exception, establish
that all reported occurrences have this cause, or verify the released 1.29.0
binary. The initial boundary refactor alone did not fix this tooltip bug.

## Exact Lingui failure: release-source reproduction

The previous baseline was too recent: `29ed948df3` already contained #7603
(`ee74a63b1c`), which moves Lingui above the router. The `desktop-v1.29.0` tag
mounts RouterProvider directly, leaving the translated root error page outside
the route-owned Lingui provider when the route fails.

Temporarily restored the tag's renderer entry point, boot boundary/handler, root
route/layout, error/not-found pages, and resource sparkline; all files were then
restored to the PR version. The real Machine resources chart interaction now
reproduced the provider failure without fault injection. Development mode reports
`useLingui hook was used without I18nProvider` from `ErrorPage`.

Repeated with a production-mode Vite renderer on port 4846 in the same Electron
window (CDP 9457). A local same-origin API proxy forwarded to the existing dev
API on 4841; the restored signed-in session and active organization were checked.
Production React/Lingui omit the development context assertion. The identical
chart interaction then produced:

```text
Cannot destructure property '_' of '_useLingui(...)' as it is null.
```

The generated `_useLingui` alias is the only wording difference from the report.
Clicking Show Error exposed it beneath TanStack's “Something went wrong!” heading.
Screenshot: `/tmp/ripple-cdp-audit/lingui-exact-before.png`.
The chain is the tooltip's invalid date → root fallback outside its provider →
Lingui null destructuring → TanStack's built-in global error UI.

This is a reconstruction using the release's relevant source files and current
installed dependencies, not a run of the distributed 1.29.0 binary. No synthetic
throw, missing-provider patch, or mocked error response was used.

With the PR source restored, the same production-mode sequence passed all 20
refresh clicks and 20 cursor moves after 15 seconds of live sampling, with zero
captured console errors and no fallback. Screenshot:
`/tmp/ripple-cdp-audit/issue7648-release-lingui-production-fixed.png`.
Both screenshots were inspected. Matching result JSON files use the
`issue7648-release-lingui-production` and `-fixed` names in the same directory.

## Settings content containment

Temporarily restored only the old resource sparkline to reproduce the known
chart crash through real cursor/refresh input, then restored its fixed source.
Before adding the Settings content boundary, the crash replaced the whole window.
Afterwards, the same crash displayed `This view hit an error` in the content pane;
the Settings sidebar and native title-bar region remained visible. Clicking
Appearance in the retained sidebar recovered without a reload. The shared
boundary integration tests cover navigation reset and fallback escalation, and
an AST test ensures both Settings outlet variants stay inside the boundary.

Captured and inspected `/tmp/ripple-cdp-audit/issue7648-settings-contained.png`;
its matching JSON records `sidebarRetained: true` and `navigationRecovered: true`.
The before screenshot is `issue7648-settings-uncontained.png`, and the recovered
Appearance screenshot is `settings-navigation-recovered.png` in the same folder.
