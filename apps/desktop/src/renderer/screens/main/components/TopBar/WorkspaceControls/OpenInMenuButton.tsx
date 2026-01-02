import type { ExternalApp } from "@superset/local-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiChevronDown } from "react-icons/hi2";
import { LuCopy } from "react-icons/lu";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import vscodeIcon from "renderer/assets/app-icons/vscode.svg";
import {
	APP_OPTIONS,
	getAppOption,
	JETBRAINS_OPTIONS,
	VSCODE_OPTIONS,
} from "renderer/components/OpenInButton";
import { trpc } from "renderer/lib/trpc";
import { useHotkeyText } from "renderer/stores/hotkeys";

interface OpenInMenuButtonProps {
	worktreePath: string;
}

export function OpenInMenuButton({ worktreePath }: OpenInMenuButtonProps) {
	const utils = trpc.useUtils();
	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();
	const openInApp = trpc.external.openInApp.useMutation({
		onSuccess: () => utils.settings.getLastUsedApp.invalidate(),
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});
	const copyPath = trpc.external.copyPath.useMutation({
		onSuccess: () => toast.success("Path copied to clipboard"),
		onError: (error) => toast.error(`Failed to copy path: ${error.message}`),
	});

	const currentApp = getAppOption(lastUsedApp);
	const openInShortcut = useHotkeyText("OPEN_IN_APP");
	const copyPathShortcut = useHotkeyText("COPY_PATH");
	const showOpenInShortcut = openInShortcut !== "Unassigned";
	const showCopyPathShortcut = copyPathShortcut !== "Unassigned";
	const isLoading = openInApp.isPending || copyPath.isPending;

	const handleOpenInEditor = () => {
		if (isLoading) return;
		openInApp.mutate({ path: worktreePath, app: lastUsedApp });
	};

	const handleOpenInOtherApp = (appId: ExternalApp) => {
		if (isLoading) return;
		openInApp.mutate({ path: worktreePath, app: appId });
	};

	const handleCopyPath = () => {
		if (isLoading) return;
		copyPath.mutate(worktreePath);
	};

	const BUTTON_HEIGHT = 24;

	return (
		<div className="flex items-center no-drag">
			{/* Main button - opens in last used app */}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleOpenInEditor}
						disabled={isLoading}
						style={{ height: `${BUTTON_HEIGHT}px` }}
						className={cn(
							"flex items-center gap-1.5 pl-2 pr-1.5 rounded-l border border-r-0 border-foreground/20 bg-foreground/5 text-xs font-medium transition-colors",
							"hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
							isLoading && "opacity-50 cursor-not-allowed",
						)}
					>
						<img
							src={currentApp.icon}
							alt={currentApp.label}
							className="size-3.5 object-contain shrink-0"
						/>
						<span className="text-foreground">Open</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={8} className="max-w-[300px]">
					<div className="flex flex-col gap-1">
						<span className="flex items-center gap-1.5">
							Open in {currentApp.displayLabel ?? currentApp.label}
							{showOpenInShortcut && (
								<kbd className="px-1.5 py-0.5 text-[10px] font-sans bg-foreground/10 rounded">
									{openInShortcut}
								</kbd>
							)}
						</span>
						<span className="text-[10px] text-muted-foreground font-mono truncate">
							{worktreePath}
						</span>
					</div>
				</TooltipContent>
			</Tooltip>

			{/* Dropdown trigger */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={isLoading}
						style={{ height: `${BUTTON_HEIGHT}px` }}
						className={cn(
							"flex items-center px-1.5 rounded-r border border-foreground/20 bg-foreground/5 text-foreground/60 transition-colors",
							"hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
							isLoading && "opacity-50 cursor-not-allowed",
						)}
					>
						<HiChevronDown className="size-3" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-52">
					{APP_OPTIONS.map((app) => (
						<DropdownMenuItem
							key={app.id}
							onClick={() => handleOpenInOtherApp(app.id)}
						>
							<img
								src={app.icon}
								alt={app.label}
								className="size-4 object-contain mr-2"
							/>
							{app.label}
							{app.id === lastUsedApp && showOpenInShortcut && (
								<DropdownMenuShortcut>{openInShortcut}</DropdownMenuShortcut>
							)}
						</DropdownMenuItem>
					))}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<img
								src={vscodeIcon}
								alt="VS Code"
								className="size-4 object-contain mr-2"
							/>
							VS Code
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-44">
							{VSCODE_OPTIONS.map((app) => (
								<DropdownMenuItem
									key={app.id}
									onClick={() => handleOpenInOtherApp(app.id)}
								>
									<img
										src={app.icon}
										alt={app.label}
										className="size-4 object-contain mr-2"
									/>
									{app.label}
									{app.id === lastUsedApp && (
										<DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<img
								src={jetbrainsIcon}
								alt="JetBrains"
								className="size-4 object-contain mr-2"
							/>
							JetBrains
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-44">
							{JETBRAINS_OPTIONS.map((app) => (
								<DropdownMenuItem
									key={app.id}
									onClick={() => handleOpenInOtherApp(app.id)}
								>
									<img
										src={app.icon}
										alt={app.label}
										className="size-4 object-contain mr-2"
									/>
									{app.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleCopyPath}>
						<LuCopy className="size-4 mr-2" />
						Copy path
						{showCopyPathShortcut && (
							<DropdownMenuShortcut>{copyPathShortcut}</DropdownMenuShortcut>
						)}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
