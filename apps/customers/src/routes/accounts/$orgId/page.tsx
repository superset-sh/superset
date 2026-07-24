import { Card, CardContent } from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ActivityChart } from "@/components/ActivityChart";
import { SnapshotNote } from "@/components/SnapshotNote";
import { WeeksPicker } from "@/components/WeeksPicker";
import { useTRPC } from "@/trpc/react";
import { CompanyHeader } from "./components/CompanyHeader";
import { MembersTable } from "./components/MembersTable";
import { SubscriptionCard } from "./components/SubscriptionCard";

export const Route = createFileRoute("/accounts/$orgId/")({
	component: CompanyDetailPage,
});

function CompanyDetailPage() {
	const { orgId } = Route.useParams();
	const trpc = useTRPC();

	const [weeks, setWeeks] = useState(12);
	const detail = useQuery(trpc.customers.companyDetail.queryOptions({ orgId }));
	const timeseries = useQuery(
		trpc.customers.companyActivityTimeseries.queryOptions({ orgId, weeks }),
	);

	if (detail.isLoading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-16 w-96" />
				<div className="grid gap-4 md:grid-cols-2">
					<Skeleton className="h-48" />
					<Skeleton className="h-48" />
				</div>
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (detail.error || !detail.data) {
		return (
			<Card>
				<CardContent className="py-12 text-center">
					<p className="text-lg font-medium">Failed to load company</p>
					<p className="text-muted-foreground text-sm">
						{detail.error?.message ?? "Organization not found"}
					</p>
				</CardContent>
			</Card>
		);
	}

	const data = detail.data;

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between">
				<CompanyHeader
					org={data.org}
					health={data.health}
					churnRisk={data.churnRisk}
					lastActiveAt={data.lastActiveAt}
					memberCount={data.members.length}
				/>
				<SnapshotNote snapshotAt={data.snapshotAt} />
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<SubscriptionCard subscription={data.subscription} />
				<div className="lg:col-span-2">
					<ActivityChart
						points={timeseries.data?.points}
						isLoading={timeseries.isLoading}
						error={timeseries.error}
						headerAction={<WeeksPicker value={weeks} onChange={setWeeks} />}
					/>
				</div>
			</div>

			<MembersTable members={data.members} />
		</div>
	);
}
