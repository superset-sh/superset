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
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superset/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowLeft,
	Plus,
	RefreshCw,
	Unplug,
} from "lucide-react";
import { useState } from "react";
import { SiLinear } from "react-icons/si";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";

interface LinkedProject {
	id: string;
	name: string;
	slug: string;
}

interface PendingDisconnect {
	connectionId: string;
	workspaceName: string;
	linkedProjectCount: number;
	linkedProjects: LinkedProject[];
}

export function LinearIntegrationSettings() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const queryClient = useQueryClient();

	const [pendingDisconnect, setPendingDisconnect] =
		useState<PendingDisconnect | null>(null);

	const connectionsQuery = useQuery({
		queryKey: ["linear", "listConnections", organizationId],
		enabled: !!organizationId,
		queryFn: () =>
			apiTrpcClient.integration.linear.listConnections.query({
				organizationId: organizationId ?? "",
			}),
	});

	const disconnectMutation = useMutation({
		mutationFn: async (input: { connectionId: string; force?: boolean }) =>
			apiTrpcClient.integration.linear.disconnect.mutate(input),
		onSuccess: (result, vars) => {
			if (result.success === false && result.requiresConfirmation) {
				const conn = connectionsQuery.data?.find(
					(c) => c.id === vars.connectionId,
				);
				setPendingDisconnect({
					connectionId: vars.connectionId,
					workspaceName: conn?.externalOrgName ?? "this workspace",
					linkedProjectCount: result.linkedProjectCount,
					linkedProjects: result.linkedProjects,
				});
				return;
			}
			queryClient.invalidateQueries({
				queryKey: ["linear", "listConnections", organizationId],
			});
			toast.success("Linear workspace disconnected");
			setPendingDisconnect(null);
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to disconnect");
		},
	});

	const handleConnect = () => {
		if (!organizationId) return;
		const url = new URL(
			`${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/connect`,
		);
		url.searchParams.set("organizationId", organizationId);
		window.open(url.toString(), "_blank");
	};

	if (!organizationId) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<p className="text-sm text-muted-foreground">
					You need to be part of an organization to manage integrations.
				</p>
			</div>
		);
	}

	const connections = connectionsQuery.data ?? [];

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<Link
				to="/settings/integrations"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
			>
				<ArrowLeft className="size-4" />
				Back to Integrations
			</Link>

			<div className="flex items-start gap-6 mb-8">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-card p-3">
					<SiLinear className="size-10" />
				</div>
				<div className="flex-1">
					<h1 className="text-2xl font-semibold">Linear</h1>
					<p className="mt-1 text-muted-foreground">
						Sync issues bidirectionally with Linear. Connect multiple Linear
						workspaces and assign each project to one.
					</p>
				</div>
				<Button onClick={handleConnect} className="gap-2 shrink-0">
					<Plus className="size-4" />
					Connect workspace
				</Button>
			</div>

			{connectionsQuery.isLoading ? (
				<div className="space-y-3">
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-32 w-full" />
				</div>
			) : connections.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center">
						<p className="text-sm text-muted-foreground">
							No Linear workspaces connected yet.
						</p>
						<Button onClick={handleConnect} className="mt-4 gap-2">
							<Plus className="size-4" />
							Connect Linear
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					{connections.map((conn) => (
						<ConnectionCard
							key={conn.id}
							connection={conn}
							onDisconnect={() =>
								disconnectMutation.mutate({ connectionId: conn.id })
							}
							isDisconnecting={
								disconnectMutation.isPending &&
								disconnectMutation.variables?.connectionId === conn.id
							}
						/>
					))}
				</div>
			)}

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
							{pendingDisconnect?.linkedProjectCount === 1 ? "s" : ""}{" "}
							{pendingDisconnect?.workspaceName}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-3">
								<p>
									Disconnecting will remove the Linear workspace assignment from
									these projects:
								</p>
								<ul className="list-disc pl-5 space-y-1 text-sm">
									{pendingDisconnect?.linkedProjects.map((p) => (
										<li key={p.id}>{p.name}</li>
									))}
									{pendingDisconnect &&
										pendingDisconnect.linkedProjectCount >
											pendingDisconnect.linkedProjects.length && (
											<li className="text-muted-foreground">
												…and{" "}
												{pendingDisconnect.linkedProjectCount -
													pendingDisconnect.linkedProjects.length}{" "}
												more
											</li>
										)}
								</ul>
								<p>Would you like to reassign them first?</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Reassign first</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingDisconnect) {
									disconnectMutation.mutate({
										connectionId: pendingDisconnect.connectionId,
										force: true,
									});
								}
							}}
						>
							Disconnect anyway
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

interface Connection {
	id: string;
	externalOrgId: string | null;
	externalOrgName: string | null;
	config: { newTasksTeamId?: string } | null;
	disconnectedAt: Date | null;
	disconnectReason: string | null;
	linkedProjectCount: number;
}

function ConnectionCard({
	connection,
	onDisconnect,
	isDisconnecting,
}: {
	connection: Connection;
	onDisconnect: () => void;
	isDisconnecting: boolean;
}) {
	const queryClient = useQueryClient();
	const teamsQuery = useQuery({
		queryKey: ["linear", "getTeams", connection.id],
		queryFn: () =>
			apiTrpcClient.integration.linear.getTeams.query({
				connectionId: connection.id,
			}),
	});

	const updateConfig = useMutation({
		mutationFn: (newTasksTeamId: string) =>
			apiTrpcClient.integration.linear.updateConfig.mutate({
				connectionId: connection.id,
				newTasksTeamId,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["linear", "listConnections"],
			});
			toast.success("Default team updated");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to update team");
		},
	});

	const triggerSync = useMutation({
		mutationFn: () =>
			apiTrpcClient.integration.linear.triggerSync.mutate({
				connectionId: connection.id,
			}),
		onSuccess: () => {
			toast.success("Sync queued. Issues will refresh shortly.");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to start sync");
		},
	});

	const teams = teamsQuery.data ?? [];

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="flex size-10 items-center justify-center rounded-lg border bg-muted">
						<SiLinear className="size-5" />
					</div>
					<div>
						<CardTitle className="text-base">
							{connection.externalOrgName ?? "Unnamed workspace"}
						</CardTitle>
						<p className="text-xs text-muted-foreground mt-0.5">
							{connection.linkedProjectCount} project
							{connection.linkedProjectCount === 1 ? "" : "s"} linked
						</p>
					</div>
					{connection.disconnectedAt && (
						<Badge variant="destructive" className="gap-1">
							<AlertTriangle className="size-3" />
							Reconnect required
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => triggerSync.mutate()}
						disabled={triggerSync.isPending || !!connection.disconnectedAt}
						className="gap-2"
					>
						<RefreshCw
							className={`size-3.5 ${triggerSync.isPending ? "animate-spin" : ""}`}
						/>
						{triggerSync.isPending ? "Syncing..." : "Resync"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={onDisconnect}
						disabled={isDisconnecting}
						className="gap-2"
					>
						<Unplug className="size-3.5" />
						{isDisconnecting ? "Disconnecting..." : "Disconnect"}
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				<p className="text-sm font-medium">Default team for new tasks</p>
				<Select
					value={connection.config?.newTasksTeamId}
					onValueChange={(teamId) => updateConfig.mutate(teamId)}
					disabled={
						updateConfig.isPending || teamsQuery.isLoading || teams.length === 0
					}
				>
					<SelectTrigger className="w-64">
						<SelectValue
							placeholder={
								teamsQuery.isLoading ? "Loading teams..." : "Select a team"
							}
						/>
					</SelectTrigger>
					<SelectContent>
						{teams.map((team) => (
							<SelectItem key={team.id} value={team.id}>
								{team.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground">
					Tasks created in projects assigned to this workspace land in this
					Linear team.
				</p>
			</CardContent>
		</Card>
	);
}
