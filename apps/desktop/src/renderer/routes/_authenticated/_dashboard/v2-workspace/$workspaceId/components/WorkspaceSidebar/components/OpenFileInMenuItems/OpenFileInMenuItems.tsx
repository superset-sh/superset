import { Trans, useLingui } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { AppWindow, ExternalLink } from "lucide-react";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import vscodeIcon from "renderer/assets/app-icons/vscode.svg";
import {
	AppOptionIcon,
	useCustomApps,
} from "renderer/components/OpenInExternalDropdown";
import {
	IDE_OPTIONS,
	JETBRAINS_OPTIONS,
	type OpenInExternalAppOption,
	VSCODE_OPTIONS,
} from "renderer/components/OpenInExternalDropdown/constants";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useThemeStore } from "renderer/stores";

interface OpenFileInMenuItemsProps {
	/** Repo-relative file path. */
	path: string;
	workspaceId: string;
	menuType?: "context" | "dropdown";
}

// Radix context-menu and dropdown-menu share an identical API; pick the set
// that matches the surrounding menu (same pattern as PathActionsMenuItems).
const PRIMITIVES = {
	context: {
		Item: ContextMenuItem,
		Sub: ContextMenuSub,
		SubTrigger: ContextMenuSubTrigger,
		SubContent: ContextMenuSubContent,
	},
	dropdown: {
		Item: DropdownMenuItem,
		Sub: DropdownMenuSub,
		SubTrigger: DropdownMenuSubTrigger,
		SubContent: DropdownMenuSubContent,
	},
} as const;

/**
 * "Open file in ▸" submenu — opens the specific file (not the workspace) in the
 * chosen editor. Routes through `useOpenInExternalEditor` so the remote-host
 * guard and path resolution match the sibling "Open in Editor" action.
 *
 * A focused component rather than reusing OpenInExternalDropdownItems. That
 * one is workspace-scoped (bakes in Finder + Terminal + Copy-path); a single
 * file only wants editors, so forcing it through here would mean adding
 * hide-flags to a shared component for one caller.
 */
export function OpenFileInMenuItems({
	path,
	workspaceId,
	menuType = "context",
}: OpenFileInMenuItemsProps) {
	const { t } = useLingui();
	const isDark = useThemeStore((state) => state.activeTheme?.type === "dark");
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const customApps = useCustomApps();
	const { Item, Sub, SubTrigger, SubContent } = PRIMITIVES[menuType];

	// Terminals are intentionally omitted — they open a directory, not a file.
	const appRows = (apps: OpenInExternalAppOption[]) =>
		apps.map((app) => (
			<Item
				key={app.id}
				onSelect={() => openInExternalEditor(path, { app: app.id })}
			>
				<AppOptionIcon option={app} isDark={isDark} />
				{app.label}
			</Item>
		));

	const triggerLabel = (icon: string, label: string) => (
		<div className="flex items-center gap-2">
			<img src={icon} alt="" className="size-4 object-contain" />
			<span>{label}</span>
		</div>
	);

	return (
		<Sub>
			<SubTrigger>
				<ExternalLink />
				<Trans>Open file in</Trans>
			</SubTrigger>
			<SubContent>
				<Sub>
					<SubTrigger>
						{triggerLabel(vscodeIcon, t({ message: "IDE" }))}
					</SubTrigger>
					<SubContent>
						{appRows(IDE_OPTIONS)}
						<Sub>
							<SubTrigger>
								{triggerLabel(vscodeIcon, t({ message: "VS Code" }))}
							</SubTrigger>
							<SubContent>{appRows(VSCODE_OPTIONS)}</SubContent>
						</Sub>
						<Sub>
							<SubTrigger>
								{triggerLabel(jetbrainsIcon, t({ message: "JetBrains" }))}
							</SubTrigger>
							<SubContent>{appRows(JETBRAINS_OPTIONS)}</SubContent>
						</Sub>
					</SubContent>
				</Sub>
				{customApps.length > 0 && (
					<Sub>
						<SubTrigger>
							<div className="flex items-center gap-2">
								<AppWindow className="size-4" />
								<span>
									<Trans>Custom</Trans>
								</span>
							</div>
						</SubTrigger>
						<SubContent>{appRows(customApps)}</SubContent>
					</Sub>
				)}
			</SubContent>
		</Sub>
	);
}
