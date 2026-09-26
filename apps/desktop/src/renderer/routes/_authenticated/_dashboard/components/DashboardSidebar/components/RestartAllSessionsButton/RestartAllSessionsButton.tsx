import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatNumber } from "@superset/i18n/format";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { LuRotateCw } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface RestartRequest {
	hostUrl: string;
	terminalIds: string[];
}

export function RestartAllSessionsButton({
	hostUrl,
	isCollapsed,
}: {
	hostUrl: string | null;
	isCollapsed: boolean;
}) {
	const { t } = useLingui();
	const [request, setRequest] = useState<RestartRequest | null>(null);
	const inspect = useMutation({
		mutationFn: async (url: string) => {
			const candidates =
				await getHostServiceClientByUrl(
					url,
				).terminalAgents.restartCandidates.query();
			return {
				hostUrl: url,
				terminalIds: candidates.map((candidate) => candidate.terminalId),
			};
		},
		onSuccess: (result) => {
			if (result.terminalIds.length === 0) {
				toast.info(t({ message: "No resumable agent sessions are running." }));
				return;
			}
			setRequest(result);
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
	const restart = useMutation({
		mutationFn: (input: RestartRequest) =>
			getHostServiceClientByUrl(
				input.hostUrl,
			).terminalAgents.restartSessions.mutate({
				terminalIds: input.terminalIds,
			}),
		onSuccess: (result) => {
			const restarted = formatNumber(result.restartedTerminalIds.length);
			const failed = formatNumber(result.failedTerminalIds.length);
			if (result.failedTerminalIds.length > 0) {
				toast.error(
					t({ message: `Restarted: ${restarted}. Failed: ${failed}.` }),
				);
			} else {
				toast.success(t({ message: `Sessions restarted: ${restarted}.` }));
			}
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
	const count = formatNumber(request?.terminalIds.length ?? 0);
	const isBusy = inspect.isPending || restart.isPending;

	return (
		<>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={t({ message: "Restart all sessions" })}
						disabled={!hostUrl || isBusy}
						onClick={() => hostUrl && inspect.mutate(hostUrl)}
						className={cn(
							"flex h-7 w-full shrink-0 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors text-muted-foreground hover:bg-fill-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
							isCollapsed && "size-7 w-7 justify-center px-0",
						)}
					>
						<LuRotateCw
							strokeWidth={1.5}
							className={cn(
								"shrink-0",
								isCollapsed ? "size-3.5" : "size-4",
								isBusy && "animate-spin motion-reduce:animate-none",
							)}
						/>
						{!isCollapsed && <Trans>Restart all sessions</Trans>}
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">
					<Trans>Restart all sessions</Trans>
				</TooltipContent>
			</Tooltip>
			<AlertDialog
				open={request !== null && request.hostUrl === hostUrl}
				onOpenChange={(open) => {
					if (!open) setRequest(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Restart all sessions</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								Restart {count} resumable agent sessions in this organization on
								this computer? Saved conversations will resume. Current work
								will be interrupted.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button variant="outline" onClick={() => setRequest(null)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							onClick={() => {
								if (!request) return;
								restart.mutate(request);
								setRequest(null);
							}}
						>
							<Trans>Restart</Trans>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
