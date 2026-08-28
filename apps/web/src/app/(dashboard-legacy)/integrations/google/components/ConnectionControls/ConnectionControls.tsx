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
import { RefreshCw, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface ConnectionControlsProps {
	organizationId: string;
	isConnected: boolean;
	needsReconnect: boolean;
}

export function ConnectionControls({
	organizationId,
	isConnected,
	needsReconnect,
}: ConnectionControlsProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();

	const disconnectMutation = useMutation(
		trpc.integration.google.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.google.getConnection.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleConnect = () => {
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/integrations/google/connect?organizationId=${organizationId}`;
	};

	if (needsReconnect) {
		return (
			<div className="flex gap-2">
				<Button onClick={handleConnect}>
					<RefreshCw className="mr-2 size-4" />
					<Trans id="web.integrations.google.reconnect">Reconnect Google</Trans>
				</Button>
				<Button
					variant="outline"
					onClick={() => disconnectMutation.mutate({ organizationId })}
					disabled={disconnectMutation.isPending}
				>
					<Unplug className="mr-2 size-4" />
					<Trans id="web.integrations.remove">Remove</Trans>
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
						{disconnectMutation.isPending ? (
							<Trans id="web.integrations.disconnecting">
								Disconnecting...
							</Trans>
						) : (
							<Trans id="web.integrations.disconnect">Disconnect</Trans>
						)}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans id="web.integrations.google.disconnectTitle">
								Disconnect Google?
							</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans id="web.integrations.google.disconnectDescription">
								Calendar and Gmail triggers in this organization will stop
								firing until an account is connected again.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans id="web.integrations.cancel">Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => disconnectMutation.mutate({ organizationId })}
						>
							<Trans id="web.integrations.disconnect">Disconnect</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return (
		<Button onClick={handleConnect}>
			<Trans id="web.integrations.google.connect">Connect Google</Trans>
		</Button>
	);
}
