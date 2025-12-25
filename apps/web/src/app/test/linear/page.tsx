"use client";

import { useUser } from "@clerk/nextjs";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Plug, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

// Hardcoded test org ID - replace with real one or make dynamic
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000000";

export default function LinearTestPage() {
	const { user } = useUser();
	const trpc = useTRPC();
	const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

	// Get Linear connection status
	const connectionQuery = useQuery(
		trpc.integration.getLinear.queryOptions({ organizationId: TEST_ORG_ID }),
	);

	// Get Linear teams
	const teamsQuery = useQuery({
		...trpc.integration.getLinearTeams.queryOptions({
			organizationId: TEST_ORG_ID,
		}),
		enabled: !!connectionQuery.data,
	});

	// Set default team mutation
	const setDefaultTeamMutation = useMutation(
		trpc.integration.setLinearDefaultTeam.mutationOptions(),
	);

	// Disconnect mutation
	const disconnectMutation = useMutation(
		trpc.integration.disconnectLinear.mutationOptions(),
	);

	// Sync status query
	const syncStatusQuery = useQuery({
		...trpc.integration.linear.getSyncStatus.queryOptions({
			organizationId: TEST_ORG_ID,
		}),
		enabled: !!connectionQuery.data,
	});

	// Sync issues mutation
	const syncIssuesMutation = useMutation(
		trpc.integration.linear.syncIssues.mutationOptions(),
	);

	const handleConnect = () => {
		// Redirect to Linear OAuth
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/connect?organizationId=${TEST_ORG_ID}`;
	};

	const handleSetDefaultTeam = async (teamId: string) => {
		await setDefaultTeamMutation.mutateAsync({
			organizationId: TEST_ORG_ID,
			teamId,
		});
		setSelectedTeam(teamId);
	};

	const handleDisconnect = async () => {
		await disconnectMutation.mutateAsync({ organizationId: TEST_ORG_ID });
		connectionQuery.refetch();
	};

	const handleSync = async () => {
		const result = await syncIssuesMutation.mutateAsync({
			organizationId: TEST_ORG_ID,
			teamId: selectedTeam ?? undefined,
		});
		// Refetch sync status after sync
		syncStatusQuery.refetch();
		return result;
	};

	const isConnected = !!connectionQuery.data;

	return (
		<div className="container mx-auto max-w-2xl py-12">
			<h1 className="mb-8 text-2xl font-bold">Linear Integration Test</h1>

			<div className="space-y-6">
				{/* User Info */}
				<Card>
					<CardHeader>
						<CardTitle>Current User</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							{user?.primaryEmailAddress?.emailAddress ?? "Not signed in"}
						</p>
						<p className="text-muted-foreground mt-1 text-xs">
							Test Org ID: {TEST_ORG_ID}
						</p>
					</CardContent>
				</Card>

				{/* Connection Status */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							{isConnected ? (
								<Plug className="size-5 text-green-500" />
							) : (
								<Unplug className="size-5 text-muted-foreground" />
							)}
							Connection Status
						</CardTitle>
						<CardDescription>
							{connectionQuery.isLoading
								? "Checking..."
								: isConnected
									? `Connected to ${connectionQuery.data?.externalOrgName}`
									: "Not connected"}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{connectionQuery.isLoading ? (
							<Loader2 className="size-4 animate-spin" />
						) : isConnected ? (
							<div className="space-y-4">
								<div className="text-muted-foreground text-sm">
									<p>
										Linear Org ID:{" "}
										<code className="bg-muted rounded px-1">
											{connectionQuery.data?.externalOrgId}
										</code>
									</p>
									<p>
										Sync Enabled:{" "}
										{connectionQuery.data?.syncEnabled ? "Yes" : "No"}
									</p>
									<p>
										Connected:{" "}
										{connectionQuery.data?.createdAt
											? new Date(
													connectionQuery.data.createdAt,
												).toLocaleDateString()
											: "Unknown"}
									</p>
								</div>
								<Button
									variant="destructive"
									size="sm"
									onClick={handleDisconnect}
									disabled={disconnectMutation.isPending}
								>
									{disconnectMutation.isPending ? (
										<Loader2 className="mr-2 size-4 animate-spin" />
									) : null}
									Disconnect
								</Button>
							</div>
						) : (
							<Button onClick={handleConnect}>
								<ExternalLink className="mr-2 size-4" />
								Connect Linear
							</Button>
						)}

						{connectionQuery.isError && (
							<p className="mt-2 text-sm text-red-500">
								Error: {connectionQuery.error.message}
							</p>
						)}
					</CardContent>
				</Card>

				{/* Teams */}
				{isConnected && (
					<Card>
						<CardHeader>
							<CardTitle>Linear Teams</CardTitle>
							<CardDescription>
								Select a default team for syncing tasks
							</CardDescription>
						</CardHeader>
						<CardContent>
							{teamsQuery.isLoading ? (
								<Loader2 className="size-4 animate-spin" />
							) : teamsQuery.data?.length ? (
								<div className="space-y-2">
									{teamsQuery.data.map((team) => (
										<div
											key={team.id}
											className="flex items-center justify-between rounded-md border p-3"
										>
											<div>
												<p className="font-medium">{team.name}</p>
												<p className="text-muted-foreground text-xs">
													{team.key}
												</p>
											</div>
											<Button
												size="sm"
												variant={
													selectedTeam === team.id ? "default" : "outline"
												}
												onClick={() => handleSetDefaultTeam(team.id)}
												disabled={setDefaultTeamMutation.isPending}
											>
												{selectedTeam === team.id ? "Selected" : "Select"}
											</Button>
										</div>
									))}
								</div>
							) : (
								<p className="text-muted-foreground text-sm">No teams found</p>
							)}
						</CardContent>
					</Card>
				)}

				{/* Sync Issues */}
				{isConnected && (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<RefreshCw className="size-5" />
								Sync Issues
							</CardTitle>
							<CardDescription>
								Pull issues from Linear into your tasks
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{/* Sync Status */}
								{syncStatusQuery.data && (
									<div className="text-muted-foreground text-sm">
										<p>Synced tasks: {syncStatusQuery.data.syncedCount}</p>
										{syncStatusQuery.data.withErrors > 0 && (
											<p className="text-yellow-500">
												With errors: {syncStatusQuery.data.withErrors}
											</p>
										)}
										{syncStatusQuery.data.lastSyncedAt && (
											<p>
												Last sync:{" "}
												{new Date(
													syncStatusQuery.data.lastSyncedAt,
												).toLocaleString()}
											</p>
										)}
									</div>
								)}

								{/* Sync Button */}
								<Button
									onClick={handleSync}
									disabled={syncIssuesMutation.isPending || !selectedTeam}
								>
									{syncIssuesMutation.isPending ? (
										<Loader2 className="mr-2 size-4 animate-spin" />
									) : (
										<RefreshCw className="mr-2 size-4" />
									)}
									{syncIssuesMutation.isPending ? "Syncing..." : "Sync Now"}
								</Button>

								{!selectedTeam && (
									<p className="text-muted-foreground text-xs">
										Select a team above to enable sync
									</p>
								)}

								{/* Sync Result */}
								{syncIssuesMutation.data && (
									<div className="bg-muted rounded p-3 text-sm">
										<p className="font-medium text-green-600">Sync complete!</p>
										<p>Created: {syncIssuesMutation.data.created}</p>
										<p>Updated: {syncIssuesMutation.data.updated}</p>
										<p>Total processed: {syncIssuesMutation.data.total}</p>
										{syncIssuesMutation.data.errors.length > 0 && (
											<div className="mt-2">
												<p className="text-yellow-600">Errors:</p>
												<ul className="list-inside list-disc text-xs">
													{syncIssuesMutation.data.errors.map((err) => (
														<li key={err}>{err}</li>
													))}
												</ul>
											</div>
										)}
									</div>
								)}

								{syncIssuesMutation.isError && (
									<p className="text-sm text-red-500">
										Error: {syncIssuesMutation.error.message}
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Debug Info */}
				<Card>
					<CardHeader>
						<CardTitle>Debug</CardTitle>
					</CardHeader>
					<CardContent>
						<pre className="bg-muted overflow-auto rounded p-4 text-xs">
							{JSON.stringify(
								{
									connection: connectionQuery.data ?? null,
									teams: teamsQuery.data ?? null,
									selectedTeam,
									syncStatus: syncStatusQuery.data ?? null,
								},
								null,
								2,
							)}
						</pre>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
