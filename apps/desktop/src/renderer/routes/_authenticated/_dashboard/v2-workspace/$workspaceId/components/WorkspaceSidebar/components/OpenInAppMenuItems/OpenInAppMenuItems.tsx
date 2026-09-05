import { Trans, useLingui } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { AppWindow, ExternalLink, Plus } from "lucide-react";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import vscodeIcon from "renderer/assets/app-icons/vscode.svg";
import {
	AppOptionIcon,
	useAppOption,
	useCustomApps,
} from "renderer/components/OpenInExternalDropdown";
import {
	IDE_OPTIONS,
	JETBRAINS_OPTIONS,
	type OpenInExternalAppOption,
	VSCODE_OPTIONS,
} from "renderer/components/OpenInExternalDropdown/constants";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useV2ProjectDefaultApp } from "renderer/routes/_authenticated/hooks/useV2ProjectDefaultApp";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useThemeStore } from "renderer/stores";

interface OpenInAppMenuItemsProps {
	/** Repo-relative file path. */
	path: string;
	workspaceId: string;
	menuType?: "context" | "dropdown";
	/** Modifier hint for the default-app row (the same click policy tier). */
	shortcutLabel?: string;
}

// Radix context-menu and dropdown-menu share an identical API; pick the set
// that matches the surrounding menu (same pattern as PathActionsMenuItems).
const PRIMITIVES = {
	context: {
		Item: ContextMenuItem,
		Separator: ContextMenuSeparator,
		Shortcut: ContextMenuShortcut,
		Sub: ContextMenuSub,
		SubTrigger: ContextMenuSubTrigger,
		SubContent: ContextMenuSubContent,
	},
	dropdown: {
		Item: DropdownMenuItem,
		Separator: DropdownMenuSeparator,
		Shortcut: DropdownMenuShortcut,
		Sub: DropdownMenuSub,
		SubTrigger: DropdownMenuSubTrigger,
		SubContent: DropdownMenuSubContent,
	},
} as const;

/**
 * "Open in app ▸" submenu for a single file. The first row is the project's
 * current default (what a modifier-click opens); below it every editor,
 * grouped like the workspace "Open in" menu, plus the user's custom apps.
 * Routes through `useOpenInExternalEditor` so the remote-host guard and path
 * resolution match the modifier-click path exactly.
 *
 * A focused component rather than reusing OpenInExternalDropdownItems. That
 * one is workspace-scoped (bakes in Finder + Terminal + Copy-path); a single
 * file only wants editors, so forcing it through here would mean adding
 * hide-flags to a shared component for one caller.
 */
export function OpenInAppMenuItems({
	path,
	workspaceId,
	menuType = "context",
	shortcutLabel,
}: OpenInAppMenuItemsProps) {
	const { t } = useLingui();
	const isDark = useThemeStore((state) => state.activeTheme?.type === "dark");
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const customApps = useCustomApps();
	const { Item, Separator, Shortcut, Sub, SubTrigger, SubContent } =
		PRIMITIVES[menuType];
	const navigate = useNavigate();

	const { workspaces } = useHostWorkspaces();
	const projectId =
		workspaces.find((w) => w.id === workspaceId)?.projectId ?? undefined;
	const { app: defaultAppRef } = useV2ProjectDefaultApp(projectId);
	const defaultApp = useAppOption(defaultAppRef);

	const addCustomAppItem = (
		<Item
			onSelect={() =>
				navigate({ to: "/settings/links", search: { addApp: true } })
			}
		>
			<Plus />
			<span className="whitespace-nowrap">
				<Trans>Add custom app…</Trans>
			</span>
		</Item>
	);

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
				<Trans>Open in app</Trans>
			</SubTrigger>
			<SubContent>
				<Item onSelect={() => openInExternalEditor(path)}>
					{defaultApp ? (
						<AppOptionIcon option={defaultApp} isDark={isDark} />
					) : (
						<ExternalLink />
					)}
					{defaultApp
						? (defaultApp.displayLabel ?? defaultApp.label)
						: t({ message: "Default app" })}
					{shortcutLabel && <Shortcut>{shortcutLabel}</Shortcut>}
				</Item>
				<Separator />
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
						<SubContent>
							{appRows(customApps)}
							<Separator />
							{addCustomAppItem}
						</SubContent>
					</Sub>
				)}
			</SubContent>
		</Sub>
	);
}
