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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface ConnectionControlsProps {
	organizationId: string;
	isConnected: boolean;
	needsReconnect?: boolean;
}

export function ConnectionControls({
	organizationId,
	isConnected,
	needsReconnect = false,
}: ConnectionControlsProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();

	const disconnectMutation = useMutation(
		trpc.integration.linear.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.linear.getConnection.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleConnect = () => {
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/connect?organizationId=${organizationId}`;
	};

	const handleDisconnect = () => {
		disconnectMutation.mutate({ organizationId });
	};

	if (isConnected && needsReconnect) {
		return (
			<div className="space-y-3">
				<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" />
					<div>
						<Trans>
							Linear authorization expired. Reconnect to resume syncing.
						</Trans>
					</div>
				</div>
				<div className="flex gap-2">
					<Button variant="destructive" onClick={handleConnect}>
						<Trans>Reconnect Linear</Trans>
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="outline" disabled={disconnectMutation.isPending}>
								<Unplug className="mr-2 size-4" />
								{disconnectMutation.isPending ? (
									<Trans>Disconnecting...</Trans>
								) : (
									<Trans>Disconnect</Trans>
								)}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									<Trans>Disconnect Linear?</Trans>
								</AlertDialogTitle>
								<AlertDialogDescription>
									<Trans>
										This will remove the connection between your organization
										and Linear. You can reconnect at any time.
									</Trans>
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>
									<Trans>Cancel</Trans>
								</AlertDialogCancel>
								<AlertDialogAction onClick={handleDisconnect}>
									<Trans>Disconnect</Trans>
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>
		);
	}

	if (isConnected) {
		return (
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="outline" disabled={disconnectMutation.isPending}>
						<Unplug className="mr-2 size-4" />
						{disconnectMutation.isPending ? (
							<Trans>Disconnecting...</Trans>
						) : (
							<Trans>Disconnect</Trans>
						)}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Disconnect Linear?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								This will remove the connection between your organization and
								Linear. You can reconnect at any time.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleDisconnect}>
							<Trans>Disconnect</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return (
		<Button onClick={handleConnect}>
			<Trans>Connect Linear</Trans>
		</Button>
	);
}
