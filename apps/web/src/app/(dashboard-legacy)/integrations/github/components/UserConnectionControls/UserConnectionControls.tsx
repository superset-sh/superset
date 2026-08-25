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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface UserConnectionControlsProps {
	organizationId: string;
	isConnected: boolean;
	needsReconnect: boolean;
}

export function UserConnectionControls({
	organizationId,
	isConnected,
	needsReconnect,
}: UserConnectionControlsProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();

	const disconnectMutation = useMutation(
		trpc.integration.github.disconnectUser.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.github.getUserConnection.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleConnect = () => {
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/integrations/github/user/connect?organizationId=${organizationId}`;
	};

	if (needsReconnect) {
		return (
			<div className="flex gap-2">
				<Button onClick={handleConnect}>
					<RefreshCw className="mr-2 size-4" />
					Reconnect account
				</Button>
				<Button
					variant="outline"
					onClick={() => disconnectMutation.mutate({ organizationId })}
					disabled={disconnectMutation.isPending}
				>
					<Unplug className="mr-2 size-4" />
					Remove
				</Button>
			</div>
		);
	}

	if (isConnected) {
		return (
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="outline" disabled={disconnectMutation.isPending}>
						<Unplug className="mr-2 size-4" />
						{disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Disconnect your GitHub account?</AlertDialogTitle>
						<AlertDialogDescription>
							Pushes and pull requests from Superset will be made by the
							Superset app instead of your account, or refused if this
							organization requires your own account.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => disconnectMutation.mutate({ organizationId })}
						>
							Disconnect
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return <Button onClick={handleConnect}>Connect your GitHub account</Button>;
}
