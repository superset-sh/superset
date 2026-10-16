import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

export function StopAccountAgent({
	hostUrl,
	sessionId,
	closeStoppedAccountSession,
	onConfirmed,
	onStopped,
}: {
	hostUrl: string;
	sessionId: string;
	closeStoppedAccountSession: (input: {
		sessionId: string;
	}) => Promise<unknown>;
	/** Pauses automatic recovery before the explicit stop request is issued. */
	onConfirmed: () => void;
	onStopped: () => void;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const inFlight = useRef(false);
	const stop = useMutation({
		mutationFn: () => closeStoppedAccountSession({ sessionId }),
		onSuccess: async () => {
			setOpen(false);
			onStopped();
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ["acp-chat-session", hostUrl, sessionId],
					exact: true,
				}),
				queryClient.invalidateQueries({
					queryKey: ["stopped-account-queue", hostUrl, sessionId],
					exact: true,
				}),
			]);
		},
		onSettled: () => {
			inFlight.current = false;
		},
	});
	return (
		<>
			<Button
				size="sm"
				variant="outline"
				disabled={stop.isPending || stop.isSuccess}
				onClick={() => setOpen(true)}
			>
				<Trans>Stop agent</Trans>
			</Button>
			<AlertDialog
				open={open}
				onOpenChange={(next) => {
					if (!inFlight.current) setOpen(next);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Stop this agent and its background work?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								This stops the agent process and any background work it owns.
								Your saved conversation stays available. Review and discard any
								queued messages first. You can then choose Resume.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					{stop.isError && (
						<p role="alert" className="text-sm text-destructive">
							<Trans>
								Could not stop the agent. Review queued messages or update this
								host, then try again.
							</Trans>
						</p>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={stop.isPending}>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={stop.isPending || stop.isSuccess}
							onClick={(event) => {
								event.preventDefault();
								if (inFlight.current || stop.isSuccess) return;
								inFlight.current = true;
								onConfirmed();
								stop.mutate();
							}}
						>
							<Trans>Stop agent and background work</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
