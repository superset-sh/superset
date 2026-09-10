"use client";

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
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Unplug } from "lucide-react";

interface DisconnectDialogProps {
	onDisconnect: () => void;
	isPending: boolean;
}

export function DisconnectDialog({
	onDisconnect,
	isPending,
}: DisconnectDialogProps) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="outline" disabled={isPending}>
					<Unplug className="mr-2 size-4" />
					{isPending ? (
						<Trans>Disconnecting...</Trans>
					) : (
						<Trans>Disconnect</Trans>
					)}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Disconnect Plain?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							This removes the connection and deletes the synced Plain tasks
							from Superset. Threads in Plain are not touched. You can reconnect
							at any time.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction onClick={onDisconnect}>
						<Trans>Disconnect</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
