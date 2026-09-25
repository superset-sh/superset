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
import { Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface ConnectionControlsProps {
	organizationId: string;
	isConnected: boolean;
}

/**
 * Connecting Sentry is an OAuth install — the button sends the admin to
 * Sentry's install flow, which redirects back through the API callback. There
 * is nothing to paste.
 */
export function ConnectionControls({
	organizationId,
	isConnected,
}: ConnectionControlsProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();

	const disconnectMutation = useMutation(
		trpc.integration.sentry.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.sentry.getConnection.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleConnect = () => {
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/integrations/sentry/connect?organizationId=${organizationId}`;
	};

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
							<Trans>Disconnect Sentry?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								Sentry triggers stop firing until you connect again. The
								integration stays installed in Sentry — uninstall it there to
								revoke access entirely.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => disconnectMutation.mutate({ organizationId })}
						>
							<Trans>Disconnect</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return (
		<Button onClick={handleConnect}>
			<Trans>Connect Sentry</Trans>
		</Button>
	);
}
