import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate as formatLocaleDate } from "@superset/i18n/format";
import { Skeleton } from "@superset/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { CreateTeamButton } from "./components/CreateTeamButton";

export function TeamsSettings() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const navigate = useNavigate();
	// Per-window org, not the shared session: the session holds one org for
	// the whole app, so a second window on another org would render this
	// window against the other one's organization.
	const activeOrganizationId = useActiveOrganizationId();

	const { data: teamsData, isPending } =
		cloudTrpc.organization.listTeams.useQuery(undefined);

	const teams = useMemo(
		() =>
			[...(teamsData ?? [])].sort(
				(a, b) =>
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			),
		[teamsData],
	);

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return formatLocaleDate(d, { month: "short", day: "numeric" });
	};

	if (!activeOrganizationId) {
		return null;
	}

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="p-8">
				<div className="max-w-5xl flex items-end justify-between gap-4">
					<div>
						<h2 className="text-2xl font-semibold">
							<HighlightText
								text={t({ message: "Teams" })}
								query={searchQuery}
							/>
						</h2>
						<p className="text-sm text-muted-foreground mt-1">
							<Trans>
								Organize your work into teams. Tasks and integrations can sync
								per-team.
							</Trans>
						</p>
					</div>
					<CreateTeamButton organizationId={activeOrganizationId} />
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="p-8">
					<div className="max-w-5xl">
						{isPending && teams.length === 0 ? (
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
								<Trans>No teams yet</Trans>
							</div>
						) : (
							<div className="border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>
												<Trans>Name</Trans>
											</TableHead>
											<TableHead>
												<Trans>Created</Trans>
											</TableHead>
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
