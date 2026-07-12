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
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
	LuBuilding2,
	LuTrendingDown,
	LuTrendingUp,
	LuUsers,
} from "react-icons/lu";

import { HealthBadge } from "@/components/HealthBadge";
import { PlanBadge } from "@/components/PlanBadge";

type CompanyRow = RouterOutputs["customers"]["listCompanies"]["rows"][number];

export interface CompaniesTableProps {
	rows: CompanyRow[] | undefined;
	total: number | undefined;
	isLoading: boolean;
	error: { message: string } | null;
}

const numberFormat = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

function TrendCell({ trendPct }: { trendPct: number | null }) {
	if (trendPct == null) return null;
	const positive = trendPct >= 0;
	return (
		<span
			className={
				positive
					? "flex items-center gap-1 text-emerald-500"
					: "flex items-center gap-1 text-red-400"
			}
		>
			{positive ? (
				<LuTrendingUp className="size-3.5" />
			) : (
				<LuTrendingDown className="size-3.5" />
			)}
			{positive ? "+" : ""}
			{trendPct}%
		</span>
	);
}

export function CompaniesTable({
	rows,
	total,
	isLoading,
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
					<p className="text-lg font-medium">Failed to load companies</p>
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
					<p className="text-lg font-medium">No companies match</p>
					<p className="text-muted-foreground text-sm">
						Try widening the filters or switching to "All orgs"
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent>
				<p className="text-muted-foreground pb-3 text-sm">
					{total?.toLocaleString()} compan{total === 1 ? "y" : "ies"}
				</p>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Company</TableHead>
							<TableHead>Members</TableHead>
							<TableHead>Plan</TableHead>
							<TableHead>Seats</TableHead>
							<TableHead>Events (30d)</TableHead>
							<TableHead>Trend</TableHead>
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
										to: "/companies/$orgId",
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
											<span className="font-medium">{row.name}</span>
											{row.slug && (
												<span className="text-muted-foreground text-xs">
													{row.slug}
												</span>
											)}
										</div>
									</div>
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
									<TrendCell trendPct={row.trendPct} />
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
