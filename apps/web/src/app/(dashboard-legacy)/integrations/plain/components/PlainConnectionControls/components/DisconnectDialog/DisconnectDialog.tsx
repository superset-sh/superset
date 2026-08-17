"use client";

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
					{isPending ? "Disconnecting..." : "Disconnect"}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Disconnect Plain?</AlertDialogTitle>
					<AlertDialogDescription>
						This removes the connection and deletes the synced Plain tasks from
						Superset. Threads in Plain are not touched. You can reconnect at any
						time.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onDisconnect}>
						Disconnect
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
