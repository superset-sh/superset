import { getInitials } from "@superset/shared/names";
import type { RouterOutputs } from "@superset/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Card, CardContent } from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { Link, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { LuBuilding2, LuLoaderCircle, LuUsers } from "react-icons/lu";

import { HealthBadge } from "@/components/HealthBadge";
import { PlanBadge } from "@/components/PlanBadge";
import { StageBadge } from "@/components/StageBadge";
import { TrendCell } from "@/components/TrendCell";

type CompanyRow = RouterOutputs["customers"]["listCompanies"]["rows"][number];

export interface CompaniesTableProps {
	rows: CompanyRow[] | undefined;
	total: number | undefined;
	isLoading: boolean;
	isFetching: boolean;
	error: { message: string } | null;
}

const numberFormat = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

export function CompaniesTable({
	rows,
	total,
	isLoading,
	isFetching,
	error,
}: CompaniesTableProps) {
	const navigate = useNavigate();

	if (isLoading && !rows) {
		return (
			<Card>
				<CardContent className="space-y-3 py-6">
					{Array.from({ length: 8 }, (_, i) => i).map((i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardContent className="py-12 text-center">
					<p className="text-lg font-medium">Failed to load accounts</p>
					<p className="text-muted-foreground text-sm">{error.message}</p>
				</CardContent>
			</Card>
		);
	}

	if (!rows || rows.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<LuBuilding2 className="text-muted-foreground mb-4 size-12" />
					<p className="text-lg font-medium">No accounts match</p>
					<p className="text-muted-foreground text-sm">
						Try widening the filters or switching to "All orgs"
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent
				className={
					isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
				}
			>
				<p className="text-muted-foreground flex items-center gap-2 pb-3 text-sm">
					{total?.toLocaleString()} account{total === 1 ? "" : "s"}
					{isFetching && <LuLoaderCircle className="size-3.5 animate-spin" />}
				</p>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Account</TableHead>
							<TableHead>Stage</TableHead>
							<TableHead>Members</TableHead>
							<TableHead>Plan</TableHead>
							<TableHead>Seats</TableHead>
							<TableHead>Events (30d)</TableHead>
							<TableHead>Trend (30d)</TableHead>
							<TableHead>Last active</TableHead>
							<TableHead>Health</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow
								key={row.orgId}
								className="cursor-pointer"
								onClick={() =>
									navigate({
										to: "/accounts/$orgId",
										params: { orgId: row.orgId },
									})
								}
							>
								<TableCell>
									<div className="flex items-center gap-3">
										<Avatar className="size-8">
											<AvatarImage src={row.logo ?? undefined} />
											<AvatarFallback>
												{getInitials(row.name, row.slug ?? row.name)}
											</AvatarFallback>
										</Avatar>
										<div className="flex flex-col">
											<Link
												to="/accounts/$orgId"
												params={{ orgId: row.orgId }}
												className="font-medium hover:underline"
												onClick={(event) => event.stopPropagation()}
											>
												{row.name}
											</Link>
											{row.slug && (
												<span className="text-muted-foreground text-xs">
													{row.slug}
												</span>
											)}
										</div>
									</div>
								</TableCell>
								<TableCell>
									<StageBadge stage={row.stage} />
								</TableCell>
								<TableCell>
									<span className="flex items-center gap-1.5">
										<LuUsers className="text-muted-foreground size-3.5" />
										{row.memberCount}
										{row.activeMembers7d > 0 && (
											<span className="text-emerald-500 text-xs">
												({row.activeMembers7d} active)
											</span>
										)}
									</span>
								</TableCell>
								<TableCell>
									<PlanBadge
										plan={row.subscription?.plan}
										status={row.subscription?.status}
										isPaying={row.subscription?.isPaying ?? false}
									/>
								</TableCell>
								<TableCell>{row.subscription?.seats ?? "—"}</TableCell>
								<TableCell>{numberFormat.format(row.events30d)}</TableCell>
								<TableCell>
									<TrendCell
										trendPct={row.trendPct}
										events30d={row.events30d}
										events30dPrev={row.events30dPrev}
									/>
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{row.lastActiveAt
										? formatDistanceToNow(row.lastActiveAt, {
												addSuffix: true,
											})
										: "never"}
								</TableCell>
								<TableCell>
									<HealthBadge health={row.health} churnRisk={row.churnRisk} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
