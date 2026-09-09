// Directories (repo-relative) that must contain no hardcoded user-facing JSX
// text — every string in them goes through Lingui. Add a directory here once
// it is fully converted. This list only grows; removing an entry is a
// regression, the same ratchet contract as the no-*-blocking tests.
export const ENFORCED_DIRS: readonly string[] = [
	"packages/i18n/src",
	"apps/web/src/app/account-pending-deletion",
	// automations is temporarily un-enforced: the trigger-fidelity work
	// rewrote most of its copy, and converting the new strings is deferred to
	// a dedicated i18n pass. Re-add once that lands.
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/components",
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/new-workspace",
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/pages",
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/plugins",
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/project",
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/pull-requests",
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks",
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspaces",
	"apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal",
	// settings — everything except `project/` ($projectId), the v1 counterpart
	// of v2-project that dies with the v1 sunset.
	"apps/desktop/src/renderer/routes/_authenticated/settings/account",
	"apps/desktop/src/renderer/routes/_authenticated/settings/agents",
	"apps/desktop/src/renderer/routes/_authenticated/settings/api-keys",
	"apps/desktop/src/renderer/routes/_authenticated/settings/appearance",
	"apps/desktop/src/renderer/routes/_authenticated/settings/behavior",
	"apps/desktop/src/renderer/routes/_authenticated/settings/billing",
	"apps/desktop/src/renderer/routes/_authenticated/settings/browser",
	"apps/desktop/src/renderer/routes/_authenticated/settings/components",
	"apps/desktop/src/renderer/routes/_authenticated/settings/experimental",
	"apps/desktop/src/renderer/routes/_authenticated/settings/git",
	"apps/desktop/src/renderer/routes/_authenticated/settings/hooks",
	"apps/desktop/src/renderer/routes/_authenticated/settings/hosts",
	"apps/desktop/src/renderer/routes/_authenticated/settings/integrations",
	"apps/desktop/src/renderer/routes/_authenticated/settings/keyboard",
	"apps/desktop/src/renderer/routes/_authenticated/settings/links",
	// settings/models is absent, not un-enforced: the Models page and the
	// provider chain behind it were deleted, so the directory no longer exists.
	"apps/desktop/src/renderer/routes/_authenticated/settings/members",
	"apps/desktop/src/renderer/routes/_authenticated/settings/organization",
	"apps/desktop/src/renderer/routes/_authenticated/settings/permissions",
	"apps/desktop/src/renderer/routes/_authenticated/settings/presets",
	"apps/desktop/src/renderer/routes/_authenticated/settings/projects",
	"apps/desktop/src/renderer/routes/_authenticated/settings/ringtones",
	"apps/desktop/src/renderer/routes/_authenticated/settings/security",
	"apps/desktop/src/renderer/routes/_authenticated/settings/team",
	"apps/desktop/src/renderer/routes/_authenticated/settings/teams",
	"apps/desktop/src/renderer/routes/_authenticated/settings/terminal",
	"apps/desktop/src/renderer/routes/_authenticated/settings/usage",
	"apps/desktop/src/renderer/routes/_authenticated/settings/utils",
	"apps/desktop/src/renderer/routes/_authenticated/settings/v2-project",
	// batch 3: v2-workspace, shared renderer components, palette, auth routes
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace",
	"apps/desktop/src/renderer/commandPalette",
	"apps/desktop/src/renderer/components",
	"apps/desktop/src/renderer/react-query",
	"apps/desktop/src/renderer/routes/create-organization",
	"apps/desktop/src/renderer/routes/sign-in",
	// batch 5: the Expo mobile app (routing, screens, shared components)
	"apps/mobile/app",
	"apps/mobile/screens",
	"apps/mobile/components",
	// batch 5: the shared composer package. `packages/ui/src` is converted too
	// but stays out: its `open-in-chat` provider logos carry brand names
	// ("GitHub", "OpenAI", …) as SVG <title> text, which the glossary keeps
	// untranslated and this scan cannot tell apart from prose.
	"packages/chat-ui/src",
	// batch 5: marketing routes that are fully converted. The component
	// directories stay out — their mockups deliberately render fake CLI output
	// and brand names, which the scanner cannot tell from real copy.
	"apps/marketing/src/app/[lang]/contact",
	"apps/marketing/src/app/[lang]/enterprise",
	"apps/marketing/src/app/[lang]/mcp-install",
	"apps/marketing/src/app/[lang]/pricing",
	"apps/marketing/src/app/[lang]/roadmap",
	"apps/marketing/src/app/[lang]/stats",
];
