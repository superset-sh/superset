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
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface LinkedProject {
	id: string;
	name: string;
	slug: string;
}

interface ConnectionControlsProps {
	organizationId: string;
	connectionId: string;
}

export function ConnectionControls({
	organizationId,
	connectionId,
}: ConnectionControlsProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();

	const [pendingDisconnect, setPendingDisconnect] = useState<{
		linkedProjectCount: number;
		linkedProjects: LinkedProject[];
	} | null>(null);

	const disconnectMutation = useMutation(
		trpc.integration.linear.disconnect.mutationOptions({
			onSuccess: (result) => {
				if (result.success === false && result.requiresConfirmation) {
					setPendingDisconnect({
						linkedProjectCount: result.linkedProjectCount,
						linkedProjects: result.linkedProjects,
					});
					return;
				}
				queryClient.invalidateQueries({
					queryKey: trpc.integration.linear.listConnections.queryKey({
						organizationId,
					}),
				});
				setPendingDisconnect(null);
				router.refresh();
			},
		}),
	);

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				disabled={disconnectMutation.isPending}
				onClick={() => disconnectMutation.mutate({ connectionId })}
			>
				<Unplug className="mr-2 size-4" />
				{disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
			</Button>
			<AlertDialog
				open={pendingDisconnect !== null}
				onOpenChange={(open) => {
					if (!open) setPendingDisconnect(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{pendingDisconnect?.linkedProjectCount} project
							{pendingDisconnect?.linkedProjectCount === 1 ? "" : "s"} still use
							this workspace
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-3">
								<p>Disconnecting will unassign Linear from these projects:</p>
								<ul className="list-disc pl-5 space-y-1 text-sm">
									{pendingDisconnect?.linkedProjects.map((p) => (
										<li key={p.id}>{p.name}</li>
									))}
								</ul>
								<p>Would you like to reassign them first?</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Reassign first</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								disconnectMutation.mutate({ connectionId, force: true })
							}
						>
							Disconnect anyway
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

export function ConnectAnotherButton({
	organizationId,
}: {
	organizationId: string;
}) {
	return (
		<Button
			onClick={() => {
				window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/connect?organizationId=${organizationId}`;
			}}
		>
			Connect another workspace
		</Button>
	);
}

export function ConnectInitialButton({
	organizationId,
}: {
	organizationId: string;
}) {
	return (
		<Button
			onClick={() => {
				window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/connect?organizationId=${organizationId}`;
			}}
		>
			Connect Linear
		</Button>
	);
}
