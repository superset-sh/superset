import { Skeleton } from "@superset/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { CreateTeamButton } from "./components/CreateTeamButton";

export function TeamsSettings() {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const navigate = useNavigate();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	const { data: teamsData, isLoading } = useLiveQuery(
		(q) =>
			q
				.from({ teams: collections.teams })
				.select(({ teams }) => ({ ...teams }))
				.orderBy(({ teams }) => teams.createdAt, "asc"),
		[collections],
	);

	const teams = teamsData ?? [];

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	};

	if (!activeOrganizationId) {
		return null;
	}

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="p-8">
				<div className="max-w-5xl flex items-end justify-between gap-4">
					<div>
						<h2 className="text-2xl font-semibold">Teams</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Organize your work into teams. Tasks and integrations can sync
							per-team.
						</p>
					</div>
					<CreateTeamButton organizationId={activeOrganizationId} />
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="p-8">
					<div className="max-w-5xl">
						{isLoading ? (
							<div className="space-y-2 border rounded-lg p-2">
								{[1, 2, 3].map((i) => (
									<div key={i} className="flex items-center gap-4 p-4">
										<div className="flex-1 space-y-2">
											<Skeleton className="h-4 w-48" />
										</div>
										<Skeleton className="h-4 w-16" />
									</div>
								))}
							</div>
						) : teams.length === 0 ? (
							<div className="text-center py-12 text-muted-foreground border rounded-lg">
								No teams yet
							</div>
						) : (
							<div className="border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Created</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{teams.map((team) => (
											<TableRow
												key={team.id}
												className="cursor-pointer hover:bg-accent/50"
												onClick={() =>
													navigate({
														to: "/settings/teams/$teamId",
														params: { teamId: team.id },
													})
												}
											>
												<TableCell className="font-medium">
													{team.name}
												</TableCell>
												<TableCell className="text-muted-foreground">
													{formatDate(team.createdAt)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
