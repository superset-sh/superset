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
		name: "ColorSelector",
		path: "renderer/components/ColorSelector",
		sites: 3,
		note: "Workspace accent-color picker",
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
			index="06"
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
