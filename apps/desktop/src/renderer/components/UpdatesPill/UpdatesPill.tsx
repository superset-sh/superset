import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { LuCircleArrowUp, LuCircleCheck } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";
import { DownloadRing } from "./DownloadRing";
import { useAutoUpdateStatus } from "./useAutoUpdateStatus";

const STROKE_WIDTH = 1.5;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BAR_CELLS = 6;
const BAR_WINDOW = 2;
const FRAME_INTERVAL_MS = 80;
/** How long the post-update "✓ vX.Y.Z" confirmation shows before hiding */
const CONFIRM_MS = 5000;

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

/**
 * Compact version for the inline pill — canary builds carry a timestamp
 * suffix ("1.14.1-canary.20260711221936") that would overflow the sidebar
 * footer, so shorten to "1.14.1-ca". The tooltip keeps the full version.
 */
function displayVersion(version: string): string {
	const [base, prereleaseTag] = version.split("-", 2);
	return prereleaseTag ? `${base}-${prereleaseTag.slice(0, 2)}` : base;
}

/** Marquee-style terminal progress bar, e.g. `[·##···]` */
function asciiBar(frame: number): string {
	const cells = Array.from({ length: BAR_CELLS }, (_, i) =>
		(i - (frame % BAR_CELLS) + BAR_CELLS) % BAR_CELLS < BAR_WINDOW ? "#" : "·",
	);
	return `[${cells.join("")}]`;
}

interface UpdatesPillProps {
	isCollapsed?: boolean;
}

/**
 * Compact auto-update indicator that lives in the sidebar's bottom
 * settings cluster: a progress ring while downloading, a green
 * "↑ update" pill when ready (click to install), a micro ASCII loader
 * while installing, and a red "↻ retry" pill on failure. Renders
 * nothing while the app is up to date.
 */
export function UpdatesPill({ isCollapsed = false }: UpdatesPillProps) {
	const event = useAutoUpdateStatus();
	const [isInstalling, setIsInstalling] = useState(false);
	const [confirmationDone, setConfirmationDone] = useState(false);
	const installMutation = electronTrpc.autoUpdate.install.useMutation();
	const checkMutation = electronTrpc.autoUpdate.check.useMutation();
	const frame = useAsciiFrame(isInstalling);

	const status = event?.status;

	// Drop the local installing state when the status moves off READY (e.g.
	// dev-mode install emits IDLE, or an install error surfaces) — and as a
	// safety net, when the install mutation itself fails at the IPC layer,
	// which produces no status event.
	useEffect(() => {
		if (status !== AUTO_UPDATE_STATUS.READY || installMutation.isError) {
			setIsInstalling(false);
		}
	}, [status, installMutation.isError]);

	// The post-update confirmation ("✓ vX.Y.Z" after relaunching on a new
	// version) hides itself after a beat, even if the status lingers.
	useEffect(() => {
		if (status === AUTO_UPDATE_STATUS.UPDATED) {
			setConfirmationDone(false);
			const timeout = setTimeout(() => setConfirmationDone(true), CONFIRM_MS);
			return () => clearTimeout(timeout);
		}
	}, [status]);

	const isUpdated = status === AUTO_UPDATE_STATUS.UPDATED && !confirmationDone;

	if (
		status !== AUTO_UPDATE_STATUS.DOWNLOADING &&
		status !== AUTO_UPDATE_STATUS.READY &&
		status !== AUTO_UPDATE_STATUS.ERROR &&
		!isUpdated
	) {
		return null;
	}

	const isDownloading = status === AUTO_UPDATE_STATUS.DOWNLOADING;
	const isError = status === AUTO_UPDATE_STATUS.ERROR;
	const isReady = status === AUTO_UPDATE_STATUS.READY;
	const isBusy = isDownloading || isInstalling || isUpdated;
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

	const tooltip = isInstalling
		? "Installing update…"
		: isDownloading
			? `Downloading update${version ? ` v${version}` : ""}`
			: isError
				? `${event?.error ?? "Update failed"} — click to retry`
				: isUpdated
					? `Updated${version ? ` to v${version}` : ""}`
					: `Install update${version ? ` v${version}` : ""} — sessions keep running`;

	if (isCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						aria-disabled={isBusy}
						aria-label={tooltip}
						className={cn(
							"flex size-8 items-center justify-center rounded-md",
							"animate-in fade-in duration-300",
							isBusy
								? "cursor-default text-muted-foreground"
								: "hover:bg-accent/50",
						)}
					>
						{isDownloading ? (
							<DownloadRing percent={percent} className="size-3.5" />
						) : isInstalling ? (
							<span className="font-mono text-xs leading-none text-orange-600 dark:text-orange-300">
								{spinnerGlyph}
							</span>
						) : isUpdated ? (
							<LuCircleCheck
								strokeWidth={STROKE_WIDTH}
								className="size-4 text-emerald-600 dark:text-emerald-400"
							/>
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
				<TooltipContent side="right">{tooltip}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					aria-disabled={isBusy}
					className={cn(
						"inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1",
						"font-mono text-[10px] tabular-nums leading-none",
						"ring-1 ring-inset animate-in fade-in slide-in-from-bottom-1 duration-300",
						isBusy && "cursor-default",
						(isDownloading || isInstalling || isUpdated) &&
							"bg-foreground/[0.045] ring-foreground/[0.06]",
						(isDownloading || isUpdated) && "text-muted-foreground",
						isInstalling && "text-orange-600 dark:text-orange-300",
						isReady &&
							!isInstalling &&
							"bg-emerald-500/15 ring-emerald-500/25 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300",
						isError &&
							"bg-destructive/10 ring-destructive/25 text-destructive hover:bg-destructive/20",
					)}
				>
					{isInstalling ? (
						<>
							<span className="w-3 text-center text-xs leading-none">
								{spinnerGlyph}
							</span>
							<span className="tracking-tighter">{asciiBar(frame)}</span>
						</>
					) : isDownloading ? (
						<>
							<DownloadRing percent={percent} className="size-3" />
							<span>{percent !== null ? `${Math.floor(percent)}%` : "…"}</span>
						</>
					) : isUpdated ? (
						<>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								aria-hidden="true"
								className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
							>
								<path
									d="M4.5 12.5l5 5L20 6.5"
									strokeWidth={3}
									strokeLinecap="round"
									strokeLinejoin="round"
									style={{
										strokeDasharray: 26,
										animation:
											"check-draw 0.45s cubic-bezier(0.5, 0, 0.25, 1) 0.05s both",
									}}
								/>
							</svg>
							<span>
								{version ? `v${displayVersion(version)}` : "downloaded"}
							</span>
						</>
					) : isReady ? (
						<>
							<span className="size-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
							<span>↑ update</span>
						</>
					) : (
						<>
							<span className="size-1.5 shrink-0 rounded-full bg-destructive animate-pulse" />
							<span>↻ retry</span>
						</>
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">{tooltip}</TooltipContent>
		</Tooltip>
	);
}
