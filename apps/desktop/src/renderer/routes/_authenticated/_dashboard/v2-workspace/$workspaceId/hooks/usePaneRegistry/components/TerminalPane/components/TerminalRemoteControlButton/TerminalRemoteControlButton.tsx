import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Radio } from "lucide-react";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface TerminalRemoteControlButtonProps {
	workspaceId: string;
	terminalId: string;
}

interface ActiveSession {
	sessionId: string;
	webUrl: string;
	expiresAt: string;
}

type Phase = "inactive" | "creating" | "active" | "revoking";

export function TerminalRemoteControlButton({
	workspaceId,
	terminalId,
}: TerminalRemoteControlButtonProps) {
	const [phase, setPhase] = useState<Phase>("inactive");
	const [active, setActive] = useState<ActiveSession | null>(null);

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
					onClick={() => active && void copyLink(active.webUrl)}
				>
					Copy link
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
