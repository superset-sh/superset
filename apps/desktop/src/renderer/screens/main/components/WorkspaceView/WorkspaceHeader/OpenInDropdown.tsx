import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { LuCopy } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";

// Import icon assets
import cursorIcon from "./assets/cursor.svg";
import finderIcon from "./assets/finder.png";
import itermIcon from "./assets/iterm.png";
import terminalIcon from "./assets/terminal.png";
import vscodeIcon from "./assets/vscode.svg";
import warpIcon from "./assets/warp.png";
import xcodeIcon from "./assets/xcode.svg";

type ExternalApp =
	| "finder"
	| "vscode"
	| "cursor"
	| "xcode"
	| "iterm"
	| "warp"
	| "terminal";

interface AppOption {
	id: ExternalApp;
	label: string;
	shortcut?: string;
	icon: string;
}

const APP_OPTIONS: AppOption[] = [
	{ id: "finder", label: "Finder", icon: finderIcon },
	{ id: "cursor", label: "Cursor", shortcut: "⌘O", icon: cursorIcon },
	{ id: "vscode", label: "VS Code", icon: vscodeIcon },
	{ id: "xcode", label: "Xcode", icon: xcodeIcon },
	{ id: "iterm", label: "iTerm", icon: itermIcon },
	{ id: "warp", label: "Warp", icon: warpIcon },
	{ id: "terminal", label: "Terminal", icon: terminalIcon },
];

interface OpenInDropdownProps {
	worktreePath: string;
}

export function OpenInDropdown({ worktreePath }: OpenInDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const openInApp = trpc.external.openInApp.useMutation();
	const copyPath = trpc.external.copyPath.useMutation();

	const handleOpenIn = (app: ExternalApp) => {
		openInApp.mutate({ path: worktreePath, app });
		setIsOpen(false);
	};

	const handleCopyPath = () => {
		copyPath.mutate(worktreePath);
		setIsOpen(false);
	};

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1 text-muted-foreground hover:text-foreground"
				>
					Open
					<HiChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
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
						{app.shortcut && (
							<span className="text-xs text-muted-foreground">
								{app.shortcut}
							</span>
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
	);
}
