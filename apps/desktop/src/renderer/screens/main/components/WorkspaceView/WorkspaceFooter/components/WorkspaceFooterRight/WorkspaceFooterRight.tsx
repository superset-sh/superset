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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiChevronDown } from "react-icons/hi2";
import { LuArrowUpRight, LuCopy } from "react-icons/lu";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import {
	APP_OPTIONS,
	getAppOption,
	JETBRAINS_OPTIONS,
} from "renderer/components/OpenInButton";
import { shortenHomePath } from "renderer/lib/formatPath";
import { trpc } from "renderer/lib/trpc";

interface FormattedPath {
	prefix: string;
	worktreeName: string;
}

function formatWorktreePath(
	path: string,
	homeDir: string | undefined,
): FormattedPath {
	const shortenedPath = shortenHomePath(path, homeDir);

	// Split into prefix and worktree name (last segment)
	const lastSlashIndex = shortenedPath.lastIndexOf("/");
	if (lastSlashIndex !== -1) {
		return {
			prefix: shortenedPath.slice(0, lastSlashIndex + 1),
			worktreeName: shortenedPath.slice(lastSlashIndex + 1),
		};
	}

	return { prefix: "", worktreeName: shortenedPath };
}

interface WorkspaceFooterRightProps {
	worktreePath: string;
}

export function WorkspaceFooterRight({
	worktreePath,
}: WorkspaceFooterRightProps) {
	const { data: homeDir } = trpc.window.getHomeDir.useQuery();
	const utils = trpc.useUtils();
	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();
	const openInApp = trpc.external.openInApp.useMutation({
		onSuccess: () => utils.settings.getLastUsedApp.invalidate(),
	});
	const copyPath = trpc.external.copyPath.useMutation();

	const formattedPath = formatWorktreePath(worktreePath, homeDir);
	const currentApp = getAppOption(lastUsedApp);

	const handleOpenInEditor = () => {
		openInApp.mutate({ path: worktreePath, app: lastUsedApp });
	};

	const handleOpenInOtherApp = (appId: ExternalApp) => {
		openInApp.mutate({ path: worktreePath, app: appId });
	};

	const handleCopyPath = () => {
		copyPath.mutate(worktreePath);
	};

	const BUTTON_HEIGHT = 24;

	return (
		<>
			{/* Path - clickable to open */}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleOpenInEditor}
						style={{ height: `${BUTTON_HEIGHT}px` }}
						className="group flex items-center gap-1.5 pl-2 pr-1 rounded-l border border-r-0 border-foreground/20 bg-foreground/5 hover:bg-foreground/10 text-[11px] leading-none font-mono font-medium truncate max-w-[480px] transition-colors"
					>
						<img
							src={currentApp.icon}
							alt={currentApp.label}
							className="size-3.5 object-contain shrink-0"
						/>
						<span className="text-foreground/60 group-hover:text-foreground/80 transition-colors">
							{formattedPath.prefix}
						</span>
						<span className="text-foreground font-semibold">
							{formattedPath.worktreeName}
						</span>
						<LuArrowUpRight className="size-3 -translate-y-px opacity-0 group-hover:opacity-70 transition-opacity text-foreground/80 shrink-0" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={8}>
					<span className="flex items-center gap-1.5">
						Open in {currentApp.label}
						<kbd className="px-1.5 py-0.5 text-[10px] font-sans bg-foreground/10 rounded">
							⌘O
						</kbd>
					</span>
				</TooltipContent>
			</Tooltip>

			{/* Open dropdown button */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						style={{ height: `${BUTTON_HEIGHT}px` }}
						className="flex items-center gap-1 px-2 rounded-r border border-foreground/20 bg-foreground/5 hover:bg-foreground/10 text-foreground/90 transition-colors"
					>
						<span className="text-[11px] text-foreground font-semibold">
							Open
						</span>
						<HiChevronDown className="size-3 text-foreground/60" />
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
							{app.id === lastUsedApp && (
								<DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
							)}
						</DropdownMenuItem>
					))}
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
						<DropdownMenuShortcut>⌘⇧C</DropdownMenuShortcut>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}
