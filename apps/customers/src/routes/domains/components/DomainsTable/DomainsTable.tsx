import type { RouterOutputs } from "@superset/trpc";
import { Badge } from "@superset/ui/badge";
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
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { LuAtSign } from "react-icons/lu";

import { HealthBadge } from "@/components/HealthBadge";

type DomainRow = RouterOutputs["customers"]["domainRollup"]["rows"][number];

export interface DomainsTableProps {
	rows: DomainRow[] | undefined;
	total: number | undefined;
	isLoading: boolean;
	error: { message: string } | null;
}

const numberFormat = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

export function DomainsTable({
	rows,
	total,
	isLoading,
	error,
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
					<p className="text-lg font-medium">No domains match</p>
					<p className="text-muted-foreground text-sm">
						Lower the minimum user count or include freemail domains
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent>
				<p className="text-muted-foreground pb-3 text-sm">
					{total?.toLocaleString()} domain{total === 1 ? "" : "s"}
				</p>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Domain</TableHead>
							<TableHead>Users</TableHead>
							<TableHead>Active (7d)</TableHead>
							<TableHead>Events (30d)</TableHead>
							<TableHead>Orgs</TableHead>
							<TableHead>Paying orgs</TableHead>
							<TableHead>Last active</TableHead>
							<TableHead>Health</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.domain}>
								<TableCell>
									<Link
										to="/domains/$domain"
										params={{ domain: row.domain }}
										className="font-medium hover:underline"
									>
										{row.domain}
									</Link>
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
									<div className="flex max-w-96 flex-wrap gap-1">
										{row.orgs.map((org) => (
											<Link
												key={org.id}
												to="/companies/$orgId"
												params={{ orgId: org.id }}
											>
												<Badge
													variant="outline"
													className="hover:bg-accent max-w-40 truncate"
												>
													{org.name}
												</Badge>
											</Link>
										))}
										{row.totalOrgCount > row.orgs.length && (
											<Badge variant="outline">
												+{row.totalOrgCount - row.orgs.length} more
											</Badge>
										)}
									</div>
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
									<HealthBadge health={row.health} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
