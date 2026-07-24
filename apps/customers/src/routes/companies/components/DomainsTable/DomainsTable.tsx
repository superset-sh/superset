import type { RouterOutputs } from "@superset/trpc";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
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
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { LuAtSign, LuLoaderCircle, LuStar } from "react-icons/lu";

import { HealthBadge } from "@/components/HealthBadge";
import { StageBadge } from "@/components/StageBadge";
import { TrendCell } from "@/components/TrendCell";

type DomainRow = RouterOutputs["customers"]["domainRollup"]["rows"][number];

export interface DomainsTableProps {
	rows: DomainRow[] | undefined;
	total: number | undefined;
	isLoading: boolean;
	isFetching: boolean;
	error: { message: string } | null;
	pinnedDomains: Set<string>;
	onTogglePin: (domain: string, pinned: boolean) => void;
	emptyTitle?: string;
	emptyHint?: string;
}

const numberFormat = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

export function DomainsTable({
	rows,
	total,
	isLoading,
	isFetching,
	error,
	pinnedDomains,
	onTogglePin,
	emptyTitle = "No domains match",
	emptyHint = "Lower the minimum user count or include freemail domains",
}: DomainsTableProps) {
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
					<p className="text-lg font-medium">Failed to load domains</p>
					<p className="text-muted-foreground text-sm">{error.message}</p>
				</CardContent>
			</Card>
		);
	}

	if (!rows || rows.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<LuAtSign className="text-muted-foreground mb-4 size-12" />
					<p className="text-lg font-medium">{emptyTitle}</p>
					<p className="text-muted-foreground text-sm">{emptyHint}</p>
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
					{total?.toLocaleString()} domain{total === 1 ? "" : "s"}
					{isFetching && <LuLoaderCircle className="size-3.5 animate-spin" />}
				</p>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-8" />
							<TableHead>Domain</TableHead>
							<TableHead>Stage</TableHead>
							<TableHead>Users</TableHead>
							<TableHead>Active (7d)</TableHead>
							<TableHead>Events (30d)</TableHead>
							<TableHead>Trend (30d)</TableHead>
							<TableHead>Paying orgs</TableHead>
							<TableHead>Last active</TableHead>
							<TableHead>Health</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.domain}>
								<TableCell className="w-8">
									<Button
										variant="ghost"
										size="icon"
										className="size-7"
										title={
											pinnedDomains.has(row.domain)
												? "Unpin domain"
												: "Pin domain"
										}
										onClick={() =>
											onTogglePin(row.domain, !pinnedDomains.has(row.domain))
										}
									>
										<LuStar
											className={cn(
												"size-3.5",
												pinnedDomains.has(row.domain)
													? "fill-amber-400 text-amber-400"
													: "text-muted-foreground",
											)}
										/>
									</Button>
								</TableCell>
								<TableCell>
									<Link
										to="/companies/$domain"
										params={{ domain: row.domain }}
										className="font-medium hover:underline"
									>
										{row.domain}
									</Link>
								</TableCell>
								<TableCell>
									<StageBadge stage={row.stage} />
								</TableCell>
								<TableCell>{row.userCount}</TableCell>
								<TableCell>
									{row.activeUsers7d > 0 ? (
										<span className="text-emerald-500">
											{row.activeUsers7d}
										</span>
									) : (
										<span className="text-muted-foreground">0</span>
									)}
								</TableCell>
								<TableCell>{numberFormat.format(row.events30d)}</TableCell>
								<TableCell>
									<TrendCell
										trendPct={row.trendPct}
										events30d={row.events30d}
										events30dPrev={row.events30dPrev}
									/>
								</TableCell>
								<TableCell>
									{row.payingOrgCount > 0 ? (
										<Badge className="border-transparent bg-sky-500/15 text-sky-400">
											{row.payingOrgCount} paying
										</Badge>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
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
