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
import type { ComponentType } from "react";
import { useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { LuCopy } from "react-icons/lu";
import {
	SiClion,
	SiDatagrip,
	SiGoland,
	SiIntellijidea,
	SiJetbrains,
	SiPhpstorm,
	SiPycharm,
	SiRider,
	SiRubymine,
	SiWebstorm,
} from "react-icons/si";
import cursorIcon from "renderer/assets/app-icons/cursor.svg";
import finderIcon from "renderer/assets/app-icons/finder.png";
import itermIcon from "renderer/assets/app-icons/iterm.png";
import sublimeIcon from "renderer/assets/app-icons/sublime.svg";
import terminalIcon from "renderer/assets/app-icons/terminal.png";
import vscodeIcon from "renderer/assets/app-icons/vscode.svg";
import warpIcon from "renderer/assets/app-icons/warp.png";
import xcodeIcon from "renderer/assets/app-icons/xcode.svg";
import { trpc } from "renderer/lib/trpc";

interface AppOptionWithImage {
	id: ExternalApp;
	label: string;
	icon: string;
	iconType: "image";
}

interface AppOptionWithComponent {
	id: ExternalApp;
	label: string;
	icon: ComponentType<{ className?: string }>;
	iconType: "component";
}

type AppOption = AppOptionWithImage | AppOptionWithComponent;

const APP_OPTIONS: AppOption[] = [
	{ id: "finder", label: "Finder", icon: finderIcon, iconType: "image" },
	{ id: "cursor", label: "Cursor", icon: cursorIcon, iconType: "image" },
	{ id: "vscode", label: "VS Code", icon: vscodeIcon, iconType: "image" },
	{
		id: "sublime",
		label: "Sublime Text",
		icon: sublimeIcon,
		iconType: "image",
	},
	{ id: "xcode", label: "Xcode", icon: xcodeIcon, iconType: "image" },
	{ id: "iterm", label: "iTerm", icon: itermIcon, iconType: "image" },
	{ id: "warp", label: "Warp", icon: warpIcon, iconType: "image" },
	{ id: "terminal", label: "Terminal", icon: terminalIcon, iconType: "image" },
];

const JETBRAINS_OPTIONS: AppOption[] = [
	{
		id: "intellij",
		label: "IntelliJ IDEA",
		icon: SiIntellijidea,
		iconType: "component",
	},
	{
		id: "webstorm",
		label: "WebStorm",
		icon: SiWebstorm,
		iconType: "component",
	},
	{ id: "pycharm", label: "PyCharm", icon: SiPycharm, iconType: "component" },
	{
		id: "phpstorm",
		label: "PhpStorm",
		icon: SiPhpstorm,
		iconType: "component",
	},
	{
		id: "rubymine",
		label: "RubyMine",
		icon: SiRubymine,
		iconType: "component",
	},
	{ id: "goland", label: "GoLand", icon: SiGoland, iconType: "component" },
	{ id: "clion", label: "CLion", icon: SiClion, iconType: "component" },
	{ id: "rider", label: "Rider", icon: SiRider, iconType: "component" },
	{
		id: "datagrip",
		label: "DataGrip",
		icon: SiDatagrip,
		iconType: "component",
	},
	// AppCode, Fleet, and RustRover don't have icons in react-icons/si
	// They will use the JetBrains logo as fallback
	{
		id: "appcode",
		label: "AppCode",
		icon: SiJetbrains,
		iconType: "component",
	},
	{ id: "fleet", label: "Fleet", icon: SiJetbrains, iconType: "component" },
	{
		id: "rustrover",
		label: "RustRover",
		icon: SiJetbrains,
		iconType: "component",
	},
];

const ALL_APP_OPTIONS = [...APP_OPTIONS, ...JETBRAINS_OPTIONS];

const getAppOption = (id: ExternalApp) =>
	ALL_APP_OPTIONS.find((app) => app.id === id) ?? APP_OPTIONS[1];

function AppIcon({
	app,
	className = "size-4",
}: {
	app: AppOption;
	className?: string;
}) {
	if (app.iconType === "image") {
		return (
			<img
				src={app.icon}
				alt={app.label}
				className={`${className} object-contain`}
			/>
		);
	}
	const IconComponent = app.icon;
	return <IconComponent className={className} />;
}

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
							<AppIcon app={currentApp} />
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
								<AppIcon app={app} />
								<span>{app.label}</span>
							</div>
							{showShortcuts && app.id === lastUsedApp && (
								<span className="text-xs text-muted-foreground">⌘O</span>
							)}
						</DropdownMenuItem>
					))}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="flex items-center gap-2">
							<SiJetbrains className="size-4" />
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
										<AppIcon app={app} />
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
