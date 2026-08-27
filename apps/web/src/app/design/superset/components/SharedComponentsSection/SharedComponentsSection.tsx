import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";
import {
	type SharedComponent,
	SharedComponentList,
} from "./components/SharedComponentList";

const DESKTOP_COMPONENTS: SharedComponent[] = [
	{
		name: "MarkdownRenderer",
		path: "renderer/components/MarkdownRenderer",
		sites: 12,
		note: "Canonical markdown surface for agent output, comments, and docs",
	},
	{
		name: "Redirect",
		path: "renderer/components/Redirect",
		sites: 8,
		note: "Loop-proof declarative redirect — keys off the resolved href so it navigates once instead of looping on every re-render (#5729)",
	},
	{
		name: "Paywall",
		path: "renderer/components/Paywall",
		sites: 8,
		note: "Upsell surface + imperative paywall() gate for locked features",
	},
	{
		name: "AgentSelect",
		path: "renderer/components/AgentSelect",
		sites: 7,
		note: "Agent picker (Claude, Codex, Cursor…) used by every session-creation flow",
	},
	{
		name: "HotkeyMenuShortcut",
		path: "renderer/components/HotkeyMenuShortcut",
		sites: 5,
		note: "Renders a registered hotkey inside dropdown/menubar items",
	},
	{
		name: "PickerTrigger",
		path: "renderer/components/PickerTrigger",
		sites: 5,
		note: "Ghost trigger: icon + truncating label + up-down chevron (pattern demoed on the Primitives page)",
	},
	{
		name: "OpenInExternalDropdown",
		path: "renderer/components/OpenInExternalDropdown",
		sites: 5,
		note: "App-picker dropdown half of the OpenInButton split button",
	},
	{
		name: "SidebarCardSlot",
		path: "renderer/components/SidebarCardSlot",
		sites: 4,
		note: "The sidebar's one card slot — every promo/nag/alert card competes for it",
	},
	{
		name: "ColorSelector",
		path: "renderer/components/ColorSelector",
		sites: 3,
		note: "Workspace accent-color picker",
	},
	{
		name: "ZoomStable",
		path: "renderer/components/ZoomStable",
		sites: 3,
		note: "Counter-scales children so they hold a constant physical size under page zoom",
	},
	{
		name: "WorkspaceNameMarquee",
		path: "renderer/components/WorkspaceNameMarquee",
		sites: 3,
		note: "Scrolling marquee for workspace names that overflow their container",
	},
	{
		name: "RemotePathPicker",
		path: "renderer/components/RemotePathPicker",
		sites: 3,
		note: "Path picker for browsing a remote host's filesystem",
	},
	{
		name: "LinkedIssuePill",
		path: "renderer/components/LinkedIssuePill",
		sites: 3,
		note: "Pill showing a linked issue/PR with a remove affordance",
	},
	{
		name: "ImportHistoryDialog",
		path: "renderer/components/ImportHistoryDialog",
		sites: 3,
		note: "Dialog listing prior import history entries",
	},
	{
		name: "GitHubStarPill",
		path: "renderer/components/GitHubStarPill",
		sites: 3,
		note: "Pill nudging users to star the GitHub repo",
	},
	{
		name: "AnimatedStarButton",
		path: "renderer/components/AnimatedStarButton",
		sites: 3,
		note: "Animated star/favorite toggle button",
	},
	{
		name: "HotkeyTooltip",
		path: "renderer/hotkeys/components/HotkeyTooltip",
		sites: 2,
		note: "Long-hover shortcut-only tooltip; its chip style is now the TooltipContent default",
	},
	{
		name: "EmojiTextInput",
		path: "renderer/components/EmojiTextInput",
		sites: 2,
		note: "Text input with emoji picker support",
	},
	{
		name: "ThemeSwatch",
		path: "renderer/components/ThemeSwatch",
		sites: 2,
		note: "Terminal theme color-palette preview",
	},
	{
		name: "UpdatesPill",
		path: "renderer/components/UpdatesPill",
		sites: 2,
		note: "Sidebar pill shown when an app update is ready to install",
	},
	{
		name: "StarNagToast",
		path: "renderer/components/StarNagToast",
		sites: 2,
		note: "Imperative toast nagging the user to star the repo",
	},
	{
		name: "SidebarKbdHint",
		path: "renderer/components/SidebarKbdHint",
		sites: 2,
		note: "Renders a keyboard-shortcut hint label in the sidebar",
	},
	{
		name: "IssueLinkCommand",
		path: "renderer/components/IssueLinkCommand",
		sites: 2,
		note: "Command-palette action for linking an issue to the workspace",
	},
	{
		name: "CommentMarkdown",
		path: "renderer/components/CommentMarkdown",
		sites: 2,
		note: "Markdown renderer scoped to comment bodies",
	},
	{
		name: "OpenInButton",
		path: "renderer/components/OpenInButton",
		note: "Split button: open worktree in default app + app-picker dropdown",
	},
	{
		name: "AgentModelSelect",
		path: "renderer/components/AgentModelSelect",
		note: "Model picker scoped to the selected agent",
	},
	{
		name: "MarkdownEditor",
		path: "renderer/components/MarkdownEditor",
		note: "Markdown authoring surface with preview",
	},
];

const PACKAGE_COMPONENTS: SharedComponent[] = [
	{
		name: "Workspace",
		path: "packages/panes/src/react/components/Workspace",
		note: "Pane-layout root: renders a workspace's pane tree",
	},
	{
		name: "PaneHeaderActions",
		path: "packages/panes/src/react/components/PaneHeaderActions",
		note: "Standard action strip for pane headers",
	},
];

export function SharedComponentsSection() {
	return (
		<ShowcaseSection
			id="shared"
			index="09"
			title="Shared app components"
			description="Cross-feature components living outside packages/ui — check here before building a new one"
		>
			<ComponentCard
				title="Desktop renderer"
				importPath="apps/desktop/src/renderer/components/*"
				copyable={false}
				description="Electron/tRPC-coupled, so referenced rather than rendered. Badge = import sites today; high counts are promotion candidates for packages/ui"
				span
				bleed
			>
				<div className="p-4">
					<SharedComponentList items={DESKTOP_COMPONENTS} />
				</div>
			</ComponentCard>

			<ComponentCard
				title="Pane system"
				importPath="@superset/panes"
				description="React layer of the shared pane/workspace layout engine"
				span
				bleed
			>
				<div className="p-4">
					<SharedComponentList items={PACKAGE_COMPONENTS} />
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
