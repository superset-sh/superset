import { msg } from "@lingui/core/macro";
import { i18n } from "@/lib/i18n-server";
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
		note: i18n._(
			msg({
				message:
					"Canonical markdown surface for agent output, comments, and docs",
			}),
		),
	},
	{
		name: "AgentSelect",
		path: "renderer/components/AgentSelect",
		sites: 7,
		note: i18n._(
			msg({
				message:
					"Agent picker (Claude, Codex, Cursor…) used by every session-creation flow",
			}),
		),
	},
	{
		name: "HotkeyMenuShortcut",
		path: "renderer/components/HotkeyMenuShortcut",
		sites: 5,
		note: i18n._(
			msg({
				message: "Renders a registered hotkey inside dropdown/menubar items",
			}),
		),
	},
	{
		name: "PickerTrigger",
		path: "renderer/components/PickerTrigger",
		sites: 5,
		note: i18n._(
			msg({
				message:
					"Ghost trigger: icon + truncating label + up-down chevron (pattern demoed on the Primitives page)",
			}),
		),
	},
	{
		name: "ColorSelector",
		path: "renderer/components/ColorSelector",
		sites: 3,
		note: i18n._(
			msg({
				message: "Workspace accent-color picker",
			}),
		),
	},
	{
		name: "HotkeyTooltip",
		path: "renderer/hotkeys/components/HotkeyTooltip",
		sites: 2,
		note: i18n._(
			msg({
				message:
					"Long-hover shortcut-only tooltip; its chip style is now the TooltipContent default",
			}),
		),
	},
	{
		name: "EmojiTextInput",
		path: "renderer/components/EmojiTextInput",
		sites: 2,
		note: i18n._(
			msg({
				message: "Text input with emoji picker support",
			}),
		),
	},
	{
		name: "ThemeSwatch",
		path: "renderer/components/ThemeSwatch",
		sites: 2,
		note: i18n._(
			msg({
				message: "Terminal theme color-palette preview",
			}),
		),
	},
	{
		name: "UpdatesPill",
		path: "renderer/components/UpdatesPill",
		sites: 2,
		note: i18n._(
			msg({
				message: "Sidebar pill shown when an app update is ready to install",
			}),
		),
	},
	{
		name: "OpenInButton",
		path: "renderer/components/OpenInButton",
		note: i18n._(
			msg({
				message:
					"Split button: open worktree in default app + app-picker dropdown",
			}),
		),
	},
	{
		name: "AgentModelSelect",
		path: "renderer/components/AgentModelSelect",
		note: i18n._(
			msg({
				message: "Model picker scoped to the selected agent",
			}),
		),
	},
	{
		name: "MarkdownEditor",
		path: "renderer/components/MarkdownEditor",
		note: i18n._(
			msg({
				message: "Markdown authoring surface with preview",
			}),
		),
	},
];

const PACKAGE_COMPONENTS: SharedComponent[] = [
	{
		name: "Workspace",
		path: "packages/panes/src/react/components/Workspace",
		note: i18n._(
			msg({
				message: "Pane-layout root: renders a workspace's pane tree",
			}),
		),
	},
	{
		name: "PaneHeaderActions",
		path: "packages/panes/src/react/components/PaneHeaderActions",
		note: i18n._(
			msg({
				message: "Standard action strip for pane headers",
			}),
		),
	},
];

export function SharedComponentsSection() {
	return (
		<ShowcaseSection
			id="shared"
			index="06"
			title={i18n._(
				msg({
					message: "Shared app components",
				}),
			)}
			description={i18n._(
				msg({
					message:
						"Cross-feature components living outside packages/ui — check here before building a new one",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(
					msg({
						message: "Desktop renderer",
					}),
				)}
				importPath="apps/desktop/src/renderer/components/*"
				copyable={false}
				description={i18n._(
					msg({
						message:
							"Electron/tRPC-coupled, so referenced rather than rendered. Badge = import sites today; high counts are promotion candidates for packages/ui",
					}),
				)}
				span
				bleed
			>
				<div className="p-4">
					<SharedComponentList items={DESKTOP_COMPONENTS} />
				</div>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Pane system",
					}),
				)}
				importPath="@superset/panes"
				description={i18n._(
					msg({
						message: "React layer of the shared pane/workspace layout engine",
					}),
				)}
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
