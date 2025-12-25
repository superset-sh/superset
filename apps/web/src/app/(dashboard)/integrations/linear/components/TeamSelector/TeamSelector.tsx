"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Skeleton } from "@superset/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";

interface TeamSelectorProps {
	organizationId: string;
}

export function TeamSelector({ organizationId }: TeamSelectorProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const teamsQuery = useQuery(
		trpc.integration.linear.getTeams.queryOptions({ organizationId }),
	);

	const connectionQuery = useQuery(
		trpc.integration.linear.getConnection.queryOptions({ organizationId }),
	);

	const updateMutation = useMutation(
		trpc.integration.linear.updateConfig.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.linear.getConnection.queryKey({
						organizationId,
					}),
				});
			},
		}),
	);

	const handleChange = (teamId: string) => {
		updateMutation.mutate({ organizationId, newTasksTeamId: teamId });
	};

	if (teamsQuery.isLoading || connectionQuery.isLoading) {
		return <Skeleton className="h-9 w-48" />;
	}

	const teams = teamsQuery.data ?? [];
	const currentTeamId = connectionQuery.data?.config?.newTasksTeamId;

	if (teams.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No teams found in your Linear workspace.
			</p>
		);
	}

	return (
		<Select
			value={currentTeamId}
			onValueChange={handleChange}
			disabled={updateMutation.isPending}
		>
			<SelectTrigger className="w-48">
				<SelectValue placeholder="Select a team" />
			</SelectTrigger>
			<SelectContent>
				{teams.map((team) => (
					<SelectItem key={team.id} value={team.id}>
						{team.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
