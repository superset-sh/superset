import type { ExternalApp } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { LuCopy } from "react-icons/lu";
import antigravityIcon from "renderer/assets/app-icons/antigravity.svg";
import appcodeIcon from "renderer/assets/app-icons/appcode.svg";
import clionIcon from "renderer/assets/app-icons/clion.svg";
import cursorIcon from "renderer/assets/app-icons/cursor.svg";
import datagripIcon from "renderer/assets/app-icons/datagrip.svg";
import finderIcon from "renderer/assets/app-icons/finder.png";
import fleetIcon from "renderer/assets/app-icons/fleet.svg";
import ghosttyIcon from "renderer/assets/app-icons/ghostty.svg";
import golandIcon from "renderer/assets/app-icons/goland.svg";
import intellijIcon from "renderer/assets/app-icons/intellij.svg";
import itermIcon from "renderer/assets/app-icons/iterm.png";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import phpstormIcon from "renderer/assets/app-icons/phpstorm.svg";
import pycharmIcon from "renderer/assets/app-icons/pycharm.svg";
import riderIcon from "renderer/assets/app-icons/rider.svg";
import rubymineIcon from "renderer/assets/app-icons/rubymine.svg";
import rustroverIcon from "renderer/assets/app-icons/rustrover.svg";
import sublimeIcon from "renderer/assets/app-icons/sublime.svg";
import terminalIcon from "renderer/assets/app-icons/terminal.png";
import vscodeIcon from "renderer/assets/app-icons/vscode.svg";
import vscodeInsidersIcon from "renderer/assets/app-icons/vscode-insiders.svg";
import warpIcon from "renderer/assets/app-icons/warp.png";
import webstormIcon from "renderer/assets/app-icons/webstorm.svg";
import windsurfIcon from "renderer/assets/app-icons/windsurf.svg";
import windsurfWhiteIcon from "renderer/assets/app-icons/windsurf-white.svg";
import xcodeIcon from "renderer/assets/app-icons/xcode.svg";
import zedIcon from "renderer/assets/app-icons/zed.png";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHotkeyText } from "renderer/stores/hotkeys";
import { useThemeStore } from "renderer/stores";

interface AppOption {
	id: ExternalApp;
	label: string;
	lightIcon: string;
	darkIcon: string;
	displayLabel?: string;
}

export const APP_OPTIONS: AppOption[] = [
	{
		id: "finder",
		label: "Finder",
		lightIcon: finderIcon,
		darkIcon: finderIcon,
	},
	{
		id: "cursor",
		label: "Cursor",
		lightIcon: cursorIcon,
		darkIcon: cursorIcon,
	},
	{
		id: "antigravity",
		label: "Antigravity",
		lightIcon: antigravityIcon,
		darkIcon: antigravityIcon,
	},
	{
		id: "windsurf",
		label: "Windsurf",
		lightIcon: windsurfIcon,
		darkIcon: windsurfWhiteIcon,
	},
	{ id: "zed", label: "Zed", lightIcon: zedIcon, darkIcon: zedIcon },
	{
		id: "sublime",
		label: "Sublime Text",
		lightIcon: sublimeIcon,
		darkIcon: sublimeIcon,
	},
	{ id: "xcode", label: "Xcode", lightIcon: xcodeIcon, darkIcon: xcodeIcon },
	{ id: "iterm", label: "iTerm", lightIcon: itermIcon, darkIcon: itermIcon },
	{ id: "warp", label: "Warp", lightIcon: warpIcon, darkIcon: warpIcon },
	{
		id: "terminal",
		label: "Terminal",
		lightIcon: terminalIcon,
		darkIcon: terminalIcon,
	},
	{
		id: "ghostty",
		label: "Ghostty",
		lightIcon: ghosttyIcon,
		darkIcon: ghosttyIcon,
	},
];

export const VSCODE_OPTIONS: AppOption[] = [
	{
		id: "vscode",
		label: "Standard",
		lightIcon: vscodeIcon,
		darkIcon: vscodeIcon,
		displayLabel: "VS Code",
	},
	{
		id: "vscode-insiders",
		label: "Insiders",
		lightIcon: vscodeInsidersIcon,
		darkIcon: vscodeInsidersIcon,
		displayLabel: "VS Code Insiders",
	},
];

export const JETBRAINS_OPTIONS: AppOption[] = [
	{
		id: "intellij",
		label: "IntelliJ IDEA",
		lightIcon: intellijIcon,
		darkIcon: intellijIcon,
	},
	{
		id: "webstorm",
		label: "WebStorm",
		lightIcon: webstormIcon,
		darkIcon: webstormIcon,
	},
	{
		id: "pycharm",
		label: "PyCharm",
		lightIcon: pycharmIcon,
		darkIcon: pycharmIcon,
	},
	{
		id: "phpstorm",
		label: "PhpStorm",
		lightIcon: phpstormIcon,
		darkIcon: phpstormIcon,
	},
	{
		id: "rubymine",
		label: "RubyMine",
		lightIcon: rubymineIcon,
		darkIcon: rubymineIcon,
	},
	{
		id: "goland",
		label: "GoLand",
		lightIcon: golandIcon,
		darkIcon: golandIcon,
	},
	{ id: "clion", label: "CLion", lightIcon: clionIcon, darkIcon: clionIcon },
	{ id: "rider", label: "Rider", lightIcon: riderIcon, darkIcon: riderIcon },
	{
		id: "datagrip",
		label: "DataGrip",
		lightIcon: datagripIcon,
		darkIcon: datagripIcon,
	},
	{
		id: "appcode",
		label: "AppCode",
		lightIcon: appcodeIcon,
		darkIcon: appcodeIcon,
	},
	{ id: "fleet", label: "Fleet", lightIcon: fleetIcon, darkIcon: fleetIcon },
	{
		id: "rustrover",
		label: "RustRover",
		lightIcon: rustroverIcon,
		darkIcon: rustroverIcon,
	},
];

const ALL_APP_OPTIONS = [
	...APP_OPTIONS,
	...VSCODE_OPTIONS,
	...JETBRAINS_OPTIONS,
];

export const getAppOption = (id: ExternalApp) =>
	ALL_APP_OPTIONS.find((app) => app.id === id);

export interface OpenInButtonProps {
	path: string | undefined;
	/** Optional label to show next to the icon (e.g., folder name) */
	label?: string;
	/** Show keyboard shortcut hints */
	showShortcuts?: boolean;
	/** Project ID for per-project default app */
	projectId?: string;
}

export function OpenInButton({
	path,
	label,
	showShortcuts = false,
	projectId,
}: OpenInButtonProps) {
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const [isOpen, setIsOpen] = useState(false);
	const utils = electronTrpc.useUtils();
	const openInShortcut = useHotkeyText("OPEN_IN_APP");
	const copyPathShortcut = useHotkeyText("COPY_PATH");

	const showOpenInShortcut = showShortcuts && openInShortcut !== "Unassigned";
	const showCopyPathShortcut =
		showShortcuts && copyPathShortcut !== "Unassigned";

	const { data: defaultApp } = electronTrpc.projects.getDefaultApp.useQuery(
		{ projectId: projectId as string },
		{ enabled: !!projectId },
	);

	const openInApp = electronTrpc.external.openInApp.useMutation({
		onSuccess: () => {
			if (projectId) {
				utils.projects.getDefaultApp.invalidate({ projectId });
			}
		},
	});
	const copyPath = electronTrpc.external.copyPath.useMutation();

	const currentApp = defaultApp ? (getAppOption(defaultApp) ?? null) : null;

	const isDark = activeTheme?.type === "dark";
	const currentAppIcon = currentApp?.[isDark ? "darkIcon" : "lightIcon"];
	const handleOpenIn = (app: ExternalApp) => {
		if (!path) return;
		openInApp.mutate({ path, app, projectId });
		setIsOpen(false);
	};

	const handleCopyPath = () => {
		if (!path) return;
		copyPath.mutate(path);
		setIsOpen(false);
	};

	const handleOpenLastUsed = () => {
		if (!path || !defaultApp) return;
		openInApp.mutate({ path, app: defaultApp, projectId });
	};

	return (
		<ButtonGroup>
			{label && currentApp && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={handleOpenLastUsed}
							disabled={!path}
						>
							<img
								src={currentAppIcon}
								alt=""
								className="size-4 object-contain"
							/>
							<span className="font-medium">{label}</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{`Open in ${currentApp.displayLabel ?? currentApp.label}${
							showOpenInShortcut ? ` (${openInShortcut})` : ""
						}`}
					</TooltipContent>
				</Tooltip>
			)}
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="gap-1"
						disabled={!path}
					>
						<span>Open</span>
						<HiChevronDown className="size-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					{APP_OPTIONS.map((app) => (
						<DropdownMenuItem
							key={app.id}
							onClick={() => handleOpenIn(app.id)}
							className="flex items-center justify-between"
						>
							<div className="flex items-center gap-2">
								<img
									src={isDark ? app.darkIcon : app.lightIcon}
									alt={app.label}
									className="size-4 object-contain"
								/>
								<span>{app.label}</span>
							</div>
							{showOpenInShortcut && app.id === defaultApp && (
								<span className="text-xs text-muted-foreground">
									{openInShortcut}
								</span>
							)}
						</DropdownMenuItem>
					))}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="flex items-center gap-2">
							<img
								src={vscodeIcon}
								alt="VS Code"
								className="size-4 object-contain"
							/>
							<span>VS Code</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-48">
							{VSCODE_OPTIONS.map((app) => (
								<DropdownMenuItem
									key={app.id}
									onClick={() => handleOpenIn(app.id)}
									className="flex items-center justify-between"
								>
									<div className="flex items-center gap-2">
										<img
											src={isDark ? app.darkIcon : app.lightIcon}
											alt={app.label}
											className="size-4 object-contain"
										/>
										<span>{app.label}</span>
									</div>
									{showShortcuts && app.id === defaultApp && (
										<span className="text-xs text-muted-foreground">⌘O</span>
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="flex items-center gap-2">
							<img
								src={jetbrainsIcon}
								alt="JetBrains"
								className="size-4 object-contain"
							/>
							<span>JetBrains</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-48">
							{JETBRAINS_OPTIONS.map((app) => (
								<DropdownMenuItem
									key={app.id}
									onClick={() => handleOpenIn(app.id)}
									className="flex items-center justify-between"
								>
									<div className="flex items-center gap-2">
										<img
											src={isDark ? app.darkIcon : app.lightIcon}
											alt={app.label}
											className="size-4 object-contain"
										/>
										<span>{app.label}</span>
									</div>
									{showOpenInShortcut && app.id === defaultApp && (
										<span className="text-xs text-muted-foreground">
											{openInShortcut}
										</span>
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={handleCopyPath}
						className="flex items-center justify-between"
					>
						<div className="flex items-center gap-2">
							<LuCopy className="size-4" />
							<span>Copy path</span>
						</div>
						{showCopyPathShortcut && (
							<span className="text-xs text-muted-foreground">
								{copyPathShortcut}
							</span>
						)}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</ButtonGroup>
	);
}
