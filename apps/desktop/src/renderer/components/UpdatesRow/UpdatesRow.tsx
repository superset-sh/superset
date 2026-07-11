import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { LuCircleArrowUp } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";
import { DownloadRing } from "./DownloadRing";
import { useAutoUpdateStatus } from "./useAutoUpdateStatus";

const STROKE_WIDTH = 1.5;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BAR_CELLS = 10;
const BAR_WINDOW = 3;
const FRAME_INTERVAL_MS = 80;

function useAsciiFrame(active: boolean): number {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		if (!active) return;
		const interval = setInterval(
			() => setFrame((f) => f + 1),
			FRAME_INTERVAL_MS,
		);
		return () => clearInterval(interval);
	}, [active]);

	return frame;
}

/** Marquee-style terminal progress bar, e.g. `[··###·····]` */
function asciiBar(frame: number): string {
	const cells = Array.from({ length: BAR_CELLS }, (_, i) =>
		(i - (frame % BAR_CELLS) + BAR_CELLS) % BAR_CELLS < BAR_WINDOW ? "#" : "·",
	);
	return `[${cells.join("")}]`;
}

interface UpdatesRowProps {
	isCollapsed?: boolean;
}

/**
 * Sidebar-native auto-update status: a single row that morphs between
 * downloading (progress ring), ready (click to install), and error
 * (click to retry). Renders nothing while the app is up to date.
 */
export function UpdatesRow({ isCollapsed = false }: UpdatesRowProps) {
	const event = useAutoUpdateStatus();
	const [isInstalling, setIsInstalling] = useState(false);
	const installMutation = electronTrpc.autoUpdate.install.useMutation();
	const checkMutation = electronTrpc.autoUpdate.check.useMutation();
	const frame = useAsciiFrame(isInstalling);

	const status = event?.status;

	// If the status moves off READY (e.g. dev-mode install emits IDLE, or an
	// install error surfaces), drop the local installing state.
	useEffect(() => {
		if (status !== AUTO_UPDATE_STATUS.READY) setIsInstalling(false);
	}, [status]);

	if (
		status !== AUTO_UPDATE_STATUS.DOWNLOADING &&
		status !== AUTO_UPDATE_STATUS.READY &&
		status !== AUTO_UPDATE_STATUS.ERROR
	) {
		return null;
	}

	const isDownloading = status === AUTO_UPDATE_STATUS.DOWNLOADING;
	const isError = status === AUTO_UPDATE_STATUS.ERROR;
	const isReady = status === AUTO_UPDATE_STATUS.READY;
	const isBusy = isDownloading || isInstalling;
	const version = event?.version;
	const percent = event?.progress?.percent ?? null;
	const spinnerGlyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];

	const handleClick = () => {
		if (isReady && !isInstalling) {
			setIsInstalling(true);
			installMutation.mutate();
		} else if (isError) {
			checkMutation.mutate();
		}
	};

	const label = isInstalling
		? "Installing"
		: isDownloading
			? "Downloading update"
			: isError
				? "Update failed"
				: "Install update";

	if (isCollapsed) {
		return (
			<div className="px-2 pb-2 flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-300">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleClick}
							disabled={isBusy}
							aria-label={label}
							className={cn(
								"size-8 flex items-center justify-center rounded-lg",
								"bg-foreground/[0.045] ring-1 ring-inset ring-foreground/[0.05]",
								!isBusy && "hover:bg-foreground/[0.08]",
							)}
						>
							{isDownloading ? (
								<DownloadRing percent={percent} />
							) : isInstalling ? (
								<span className="font-mono text-[13px] leading-none text-orange-600 dark:text-orange-300">
									{spinnerGlyph}
								</span>
							) : (
								<LuCircleArrowUp
									strokeWidth={STROKE_WIDTH}
									className={cn(
										"size-4",
										isError
											? "text-destructive"
											: "text-emerald-600 dark:text-emerald-400",
									)}
								/>
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">
						{isError ? (event?.error ?? label) : label}
						{isReady && version ? ` · v${version}` : ""}
					</TooltipContent>
				</Tooltip>
			</div>
		);
	}

	return (
		<div className="px-2 pb-1">
			<button
				type="button"
				onClick={handleClick}
				disabled={isBusy}
				title={isError ? event?.error : undefined}
				className={cn(
					"relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2",
					"text-[13px] font-medium text-left",
					"bg-foreground/[0.045] ring-1 ring-inset ring-foreground/[0.05]",
					"animate-in fade-in slide-in-from-bottom-2 duration-300",
					isBusy
						? "cursor-default text-muted-foreground"
						: "cursor-pointer hover:bg-foreground/[0.08]",
					isReady && !isInstalling && "text-foreground",
					isError && "text-muted-foreground",
				)}
			>
				{isInstalling ? (
					<>
						<span className="w-3.5 shrink-0 text-center font-mono text-[13px] leading-none text-orange-600 dark:text-orange-300">
							{spinnerGlyph}
						</span>
						<span className="truncate">Installing</span>
						<span className="ml-auto shrink-0 font-mono text-[10px] tracking-tighter text-muted-foreground/80">
							{asciiBar(frame)}
						</span>
					</>
				) : isDownloading ? (
					<>
						<DownloadRing percent={percent} />
						<span className="truncate">Downloading update</span>
						<span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
							{percent !== null ? `${Math.floor(percent)}%` : "…"}
						</span>
						<span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground/10" />
						{percent !== null && (
							<span
								className="absolute bottom-0 left-0 h-0.5 bg-foreground/70 transition-[width] duration-300"
								style={{ width: `${percent}%` }}
							/>
						)}
					</>
				) : isReady ? (
					<>
						<span className="size-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
						<span className="truncate font-semibold">Install update</span>
						<span className="ml-auto shrink-0 rounded-full bg-orange-500/10 px-2 py-0.5 font-mono text-[10px] text-orange-600 ring-1 ring-inset ring-orange-500/20 dark:text-orange-300">
							↑ {version ? `v${version}` : "new"}
						</span>
					</>
				) : (
					<>
						<span className="size-1.5 shrink-0 rounded-full bg-destructive animate-pulse" />
						<span className="truncate">Update failed</span>
						<span className="ml-auto shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive ring-1 ring-inset ring-destructive/25">
							↻ retry
						</span>
					</>
				)}
			</button>
		</div>
	);
}
