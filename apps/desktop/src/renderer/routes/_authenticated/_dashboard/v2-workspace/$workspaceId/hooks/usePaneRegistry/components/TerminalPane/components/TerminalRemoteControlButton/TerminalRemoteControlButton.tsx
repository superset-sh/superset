import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { ExternalLink, Radio } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface TerminalRemoteControlButtonProps {
	workspaceId: string;
	terminalId: string;
}

interface ActiveSession {
	sessionId: string;
	// `webUrl` is only available right after `create` — the cloud only
	// stores `token_hash`, so we cannot reconstruct the share URL when
	// hydrating from `listForWorkspace`. `null` means "session is live but
	// the original link isn't recoverable; user needs to stop + re-share".
	webUrl: string | null;
	expiresAt: string;
}

type Phase = "inactive" | "loading" | "creating" | "active" | "revoking";
const HYDRATE_REFRESH_MS = 30_000;

export function TerminalRemoteControlButton({
	workspaceId,
	terminalId,
}: TerminalRemoteControlButtonProps) {
	// Hooks must run unconditionally — gate at render time instead of
	// short-circuiting before `useState` etc.
	const hasAccess = useFeatureFlagEnabled(
		FEATURE_FLAGS.WEB_REMOTE_CONTROL_ACCESS,
	);
	const [phase, setPhase] = useState<Phase>("loading");
	const [active, setActive] = useState<ActiveSession | null>(null);

	const hydrate = useCallback(
		async (signal?: AbortSignal): Promise<void> => {
			try {
				const rows = await apiTrpcClient.remoteControl.listForWorkspace.query({
					workspaceId,
				});
				if (signal?.aborted) return;
				const now = Date.now();
				const live = rows.find(
					(r) =>
						r.terminalId === terminalId &&
						r.status === "active" &&
						new Date(r.expiresAt).getTime() > now,
				);
				if (live) {
					setActive((prev) => ({
						sessionId: live.sessionId,
						// Preserve a previously-captured webUrl if we still have
						// it for the same session (e.g., we minted it ourselves
						// in this component lifetime).
						webUrl:
							prev && prev.sessionId === live.sessionId ? prev.webUrl : null,
						expiresAt: live.expiresAt,
					}));
					setPhase((prev) =>
						prev === "creating" || prev === "revoking" ? prev : "active",
					);
				} else {
					setActive(null);
					setPhase((prev) =>
						prev === "creating" || prev === "revoking" ? prev : "inactive",
					);
				}
			} catch {
				// Silent — background refresh; the user still has the optimistic
				// state from the last successful action.
				if (!signal?.aborted) {
					setPhase((prev) => (prev === "loading" ? "inactive" : prev));
				}
			}
		},
		[workspaceId, terminalId],
	);

	useEffect(() => {
		// Don't run the cloud hydrate poll when the user isn't in the cohort
		// — that just wastes a tRPC call every 30s for a button that won't
		// render anyway.
		if (!hasAccess) return;
		const ac = new AbortController();
		void hydrate(ac.signal);
		const timer = setInterval(
			() => void hydrate(ac.signal),
			HYDRATE_REFRESH_MS,
		);
		return () => {
			ac.abort();
			clearInterval(timer);
		};
	}, [hydrate, hasAccess]);

	if (!hasAccess) return null;

	async function copyLink(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Remote control link copied", {
				description: "Anyone with this link can control your terminal.",
			});
		} catch {
			toast.error("Failed to copy link to clipboard");
		}
	}

	async function startShare() {
		setPhase("creating");
		try {
			const result = await apiTrpcClient.remoteControl.create.mutate({
				workspaceId,
				terminalId,
				mode: "full",
			});
			setActive({
				sessionId: result.sessionId,
				webUrl: result.webUrl,
				expiresAt: result.expiresAt,
			});
			setPhase("active");
			void copyLink(result.webUrl);
		} catch (err) {
			setPhase("inactive");
			toast.error(
				`Failed to start remote control: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async function stopShare() {
		if (!active) return;
		setPhase("revoking");
		try {
			await apiTrpcClient.remoteControl.revoke.mutate({
				sessionId: active.sessionId,
			});
			setActive(null);
			setPhase("inactive");
			toast.success("Remote control stopped");
		} catch (err) {
			setPhase("active");
			toast.error(
				`Failed to stop remote control: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	if (phase === "loading") {
		// Render the button but suppress the live badge until hydration
		// completes — otherwise the badge flashes "off" on every remount even
		// when a session is in fact still live.
		return (
			<button
				type="button"
				disabled
				aria-label="Loading remote control state"
				className="rounded p-1 text-muted-foreground opacity-50"
			>
				<Radio className="size-3.5" />
			</button>
		);
	}

	if (phase === "inactive" || phase === "creating") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						disabled={phase === "creating"}
						onClick={(e) => {
							e.stopPropagation();
							void startShare();
						}}
						aria-label="Share remote control"
						className={cn(
							"rounded p-1 transition-colors",
							"text-muted-foreground hover:text-foreground",
							phase === "creating" && "opacity-50",
						)}
					>
						<Radio className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{phase === "creating" ? "Starting…" : "Share remote control"}
				</TooltipContent>
			</Tooltip>
		);
	}

	const canCopy = Boolean(active?.webUrl);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					onClick={(e) => e.stopPropagation()}
					aria-label="Remote control active"
					className={cn(
						"flex items-center gap-1 rounded px-1.5 py-0.5 text-xs",
						"text-emerald-600 dark:text-emerald-400",
						"hover:bg-emerald-500/10",
					)}
				>
					<span className="relative flex size-2">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
						<span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
					</span>
					<span className="font-medium">live</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem
					onClick={() => {
						// `window.open(url, "_blank")` is the convention used elsewhere
						// in the renderer (e.g. DashboardSidebarHelpMenu) — Electron's
						// main process intercepts and routes to the system browser
						// so the share opens outside the Superset app.
						if (active?.webUrl) window.open(active.webUrl, "_blank");
					}}
					disabled={!canCopy}
				>
					<ExternalLink className="h-4 w-4" />
					Open in browser
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => {
						if (active?.webUrl) void copyLink(active.webUrl);
					}}
					disabled={!canCopy}
				>
					{canCopy ? "Copy link" : "Link only available right after sharing"}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => void stopShare()}
					disabled={phase === "revoking"}
					className="text-destructive focus:text-destructive"
				>
					{phase === "revoking" ? "Stopping…" : "Stop sharing"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
