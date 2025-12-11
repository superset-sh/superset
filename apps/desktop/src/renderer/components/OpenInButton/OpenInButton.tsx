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
import type { ExternalApp } from "main/lib/db/schemas";
import { useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { LuCopy } from "react-icons/lu";
import appcodeIcon from "renderer/assets/app-icons/appcode.svg";
import clionIcon from "renderer/assets/app-icons/clion.svg";
import cursorIcon from "renderer/assets/app-icons/cursor.svg";
import datagripIcon from "renderer/assets/app-icons/datagrip.svg";
import finderIcon from "renderer/assets/app-icons/finder.png";
import fleetIcon from "renderer/assets/app-icons/fleet.svg";
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
import warpIcon from "renderer/assets/app-icons/warp.png";
import webstormIcon from "renderer/assets/app-icons/webstorm.svg";
import xcodeIcon from "renderer/assets/app-icons/xcode.svg";
import { trpc } from "renderer/lib/trpc";

interface AppOption {
	id: ExternalApp;
	label: string;
	icon: string;
}

const APP_OPTIONS: AppOption[] = [
	{ id: "finder", label: "Finder", icon: finderIcon },
	{ id: "cursor", label: "Cursor", icon: cursorIcon },
	{ id: "vscode", label: "VS Code", icon: vscodeIcon },
	{ id: "sublime", label: "Sublime Text", icon: sublimeIcon },
	{ id: "xcode", label: "Xcode", icon: xcodeIcon },
	{ id: "iterm", label: "iTerm", icon: itermIcon },
	{ id: "warp", label: "Warp", icon: warpIcon },
	{ id: "terminal", label: "Terminal", icon: terminalIcon },
];

const JETBRAINS_OPTIONS: AppOption[] = [
	{ id: "intellij", label: "IntelliJ IDEA", icon: intellijIcon },
	{ id: "webstorm", label: "WebStorm", icon: webstormIcon },
	{ id: "pycharm", label: "PyCharm", icon: pycharmIcon },
	{ id: "phpstorm", label: "PhpStorm", icon: phpstormIcon },
	{ id: "rubymine", label: "RubyMine", icon: rubymineIcon },
	{ id: "goland", label: "GoLand", icon: golandIcon },
	{ id: "clion", label: "CLion", icon: clionIcon },
	{ id: "rider", label: "Rider", icon: riderIcon },
	{ id: "datagrip", label: "DataGrip", icon: datagripIcon },
	{ id: "appcode", label: "AppCode", icon: appcodeIcon },
	{ id: "fleet", label: "Fleet", icon: fleetIcon },
	{ id: "rustrover", label: "RustRover", icon: rustroverIcon },
];

const ALL_APP_OPTIONS = [...APP_OPTIONS, ...JETBRAINS_OPTIONS];

export const getAppOption = (id: ExternalApp) =>
	ALL_APP_OPTIONS.find((app) => app.id === id) ?? APP_OPTIONS[1];

export interface OpenInButtonProps {
	path: string | undefined;
	/** Optional label to show next to the icon (e.g., folder name) */
	label?: string;
	/** Show keyboard shortcut hints */
	showShortcuts?: boolean;
}

export function OpenInButton({
	path,
	label,
	showShortcuts = false,
}: OpenInButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const utils = trpc.useUtils();

	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();

	const openInApp = trpc.external.openInApp.useMutation({
		onSuccess: () => utils.settings.getLastUsedApp.invalidate(),
	});
	const copyPath = trpc.external.copyPath.useMutation();

	const currentApp = getAppOption(lastUsedApp);

	const handleOpenIn = (app: ExternalApp) => {
		if (!path) return;
		openInApp.mutate({ path, app });
		setIsOpen(false);
	};

	const handleCopyPath = () => {
		if (!path) return;
		copyPath.mutate(path);
		setIsOpen(false);
	};

	const handleOpenLastUsed = () => {
		if (!path) return;
		openInApp.mutate({ path, app: lastUsedApp });
	};

	return (
		<ButtonGroup>
			{label && (
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
								src={currentApp.icon}
								alt=""
								className="size-4 object-contain"
							/>
							<span className="font-medium">{label}</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{`Open in ${currentApp.label}${showShortcuts ? " (⌘O)" : ""}`}
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
									src={app.icon}
									alt={app.label}
									className="size-4 object-contain"
								/>
								<span>{app.label}</span>
							</div>
							{showShortcuts && app.id === lastUsedApp && (
								<span className="text-xs text-muted-foreground">⌘O</span>
							)}
						</DropdownMenuItem>
					))}
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
											src={app.icon}
											alt={app.label}
											className="size-4 object-contain"
										/>
										<span>{app.label}</span>
									</div>
									{showShortcuts && app.id === lastUsedApp && (
										<span className="text-xs text-muted-foreground">⌘O</span>
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
						{showShortcuts && (
							<span className="text-xs text-muted-foreground">⌘⇧C</span>
						)}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</ButtonGroup>
	);
}
