import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { ExternalApp } from "main/lib/db/schemas";
import { useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { LuCopy } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";

import cursorIcon from "./assets/cursor.svg";
import finderIcon from "./assets/finder.png";
import itermIcon from "./assets/iterm.png";
import terminalIcon from "./assets/terminal.png";
import vscodeIcon from "./assets/vscode.svg";
import warpIcon from "./assets/warp.png";
import xcodeIcon from "./assets/xcode.svg";

interface AppOption {
	id: ExternalApp;
	label: string;
	icon: string;
}

const APP_OPTIONS: AppOption[] = [
	{ id: "finder", label: "Finder", icon: finderIcon },
	{ id: "cursor", label: "Cursor", icon: cursorIcon },
	{ id: "vscode", label: "VS Code", icon: vscodeIcon },
	{ id: "xcode", label: "Xcode", icon: xcodeIcon },
	{ id: "iterm", label: "iTerm", icon: itermIcon },
	{ id: "warp", label: "Warp", icon: warpIcon },
	{ id: "terminal", label: "Terminal", icon: terminalIcon },
];

const getAppOption = (id: ExternalApp) =>
	APP_OPTIONS.find((app) => app.id === id) ?? APP_OPTIONS[1];

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	const [isOpen, setIsOpen] = useState(false);
	const utils = trpc.useUtils();

	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();

	const openInApp = trpc.external.openInApp.useMutation({
		onSuccess: () => utils.settings.getLastUsedApp.invalidate(),
	});
	const copyPath = trpc.external.copyPath.useMutation();

	const folderName = worktreePath
		? worktreePath.split("/").filter(Boolean).pop() || worktreePath
		: null;
	const currentApp = getAppOption(lastUsedApp);

	const handleOpenIn = (app: ExternalApp) => {
		if (!worktreePath) return;
		openInApp.mutate({ path: worktreePath, app });
		setIsOpen(false);
	};

	const handleCopyPath = () => {
		if (!worktreePath) return;
		copyPath.mutate(worktreePath);
		setIsOpen(false);
	};

	const handleOpenLastUsed = () => {
		if (!worktreePath) return;
		openInApp.mutate({ path: worktreePath, app: lastUsedApp });
	};

	return (
		<div className="no-drag flex items-center">
			<ButtonGroup>
				{folderName && (
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5"
						onClick={handleOpenLastUsed}
						title={`Open in ${currentApp.label} (⌘O)`}
					>
						<img
							src={currentApp.icon}
							alt=""
							className="size-4 object-contain"
						/>
						<span className="font-medium">{folderName}</span>
					</Button>
				)}
				<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="gap-1"
							disabled={!worktreePath}
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
								{app.id === lastUsedApp && (
									<span className="text-xs text-muted-foreground">⌘O</span>
								)}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={handleCopyPath}
							className="flex items-center justify-between"
						>
							<div className="flex items-center gap-2">
								<LuCopy className="size-4" />
								<span>Copy path</span>
							</div>
							<span className="text-xs text-muted-foreground">⌘⇧C</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</ButtonGroup>
		</div>
	);
}
