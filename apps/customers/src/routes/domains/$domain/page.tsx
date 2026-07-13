import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import { Label } from "@superset/ui/label";
import { Progress } from "@superset/ui/progress";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { LuArrowLeft, LuCircleDollarSign, LuStar } from "react-icons/lu";

import { ActivityChart } from "@/components/ActivityChart";
import { HealthBadge } from "@/components/HealthBadge";
import { SnapshotNote } from "@/components/SnapshotNote";
import { StageBadge } from "@/components/StageBadge";
import { WeeksPicker } from "@/components/WeeksPicker";
import { useTRPC } from "@/trpc/react";

import { CompanyInfoCard } from "./components/CompanyInfoCard";
import { DomainUsersTable } from "./components/DomainUsersTable";

export const Route = createFileRoute("/domains/$domain/")({
	component: DomainDetailPage,
});

const numberFormat = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div>
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="text-xl font-semibold">{value}</p>
		</div>
	);
}

function DomainDetailPage() {
	const { domain } = Route.useParams();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [weeks, setWeeks] = useState(12);
	const detail = useQuery(trpc.customers.domainDetail.queryOptions({ domain }));
	const timeseries = useQuery(
		trpc.customers.domainActivityTimeseries.queryOptions({ domain, weeks }),
	);

	const researchProgress = useQuery(
		trpc.customers.domainResearchProgress.queryOptions(
			{ domain },
			{
				refetchInterval: (query) => {
					const progress = query.state.data;
					return progress && !progress.finishedAt ? 2000 : false;
				},
			},
		),
	);
	const progress = researchProgress.data;
	const isResearchRunning = Boolean(progress && !progress.finishedAt);

	// When a batch finishes, refresh the table so titles/socials appear.
	const finishedAt = progress?.finishedAt;
	useEffect(() => {
		if (finishedAt) {
			queryClient.invalidateQueries({
				queryKey: trpc.customers.domainDetail.queryKey({ domain }),
			});
		}
	}, [finishedAt, queryClient, trpc, domain]);

	const pinned = useQuery(trpc.customers.pinnedDomains.queryOptions());
	const isPinned =
		pinned.data?.rows.some((row) => row.domain === domain) ?? false;
	const togglePin = useMutation(
		trpc.customers.setDomainPinned.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({
					queryKey: trpc.customers.pinnedDomains.queryKey(),
				});
				toast.success(
					result.pinned ? `Pinned ${domain}` : `Unpinned ${domain}`,
				);
			},
		}),
	);

	const setResearchMode = useMutation(
		trpc.customers.setDomainResearchMode.mutationOptions({
			onSuccess: (result, variables) => {
				queryClient.invalidateQueries({
					queryKey: trpc.customers.domainDetail.queryKey({ domain }),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.customers.domainResearchProgress.queryKey({ domain }),
				});
				toast.success(
					variables.autoResearch
						? `Auto-research on — researching ${result.queued} people in the background`
						: "Auto-research off — research is manual again",
				);
			},
			onError: (error) => {
				toast.error(`Failed to update research mode: ${error.message}`);
			},
		}),
	);

	if (detail.isLoading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-16 w-96" />
				<Skeleton className="h-56 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (detail.error || !detail.data) {
		return (
			<Card>
				<CardContent className="py-12 text-center">
					<p className="text-lg font-medium">Failed to load domain</p>
					<p className="text-muted-foreground text-sm">
						{detail.error?.message ?? "No users found for this domain"}
					</p>
				</CardContent>
			</Card>
		);
	}

	const data = detail.data;

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between">
				<div className="space-y-3">
					<Link
						to="/domains"
						className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
					>
						<LuArrowLeft className="size-3.5" />
						Domains
					</Link>
					<div className="flex items-center gap-3">
						<h1 className="text-3xl font-bold tracking-tight">
							@{data.domain}
						</h1>
						<Button
							variant="ghost"
							size="icon"
							className="size-8"
							title={isPinned ? "Unpin domain" : "Pin domain"}
							disabled={togglePin.isPending}
							onClick={() => togglePin.mutate({ domain, pinned: !isPinned })}
						>
							<LuStar
								className={cn(
									"size-4",
									isPinned
										? "fill-amber-400 text-amber-400"
										: "text-muted-foreground",
								)}
							/>
						</Button>
						<HealthBadge health={data.health} />
						<StageBadge stage={data.stage} />
					</div>
					<p className="text-muted-foreground text-sm">
						Last active{" "}
						{data.lastActiveAt
							? formatDistanceToNow(data.lastActiveAt, { addSuffix: true })
							: "never"}
					</p>
				</div>
				<div className="flex flex-col items-end gap-2">
					<SnapshotNote snapshotAt={data.snapshotAt} />
					<div className="flex items-center gap-2">
						<Switch
							id="auto-research"
							checked={data.autoResearch}
							disabled={setResearchMode.isPending || isResearchRunning}
							onCheckedChange={(checked) =>
								setResearchMode.mutate({ domain, autoResearch: checked })
							}
						/>
						<Label
							htmlFor="auto-research"
							className="text-muted-foreground text-sm"
						>
							Auto-research everyone
						</Label>
					</div>
					{isResearchRunning && progress && (
						<div className="flex w-56 flex-col gap-1">
							<Progress
								value={
									progress.total > 0
										? (progress.done / progress.total) * 100
										: 0
								}
							/>
							<span className="text-muted-foreground text-right text-xs">
								Researching people… {progress.done}/{progress.total}
							</span>
						</div>
					)}
				</div>
			</div>

			<Card>
				<CardContent className="flex flex-wrap items-center gap-x-12 gap-y-4">
					<Stat label="Users" value={data.totalUsers} />
					<Stat
						label="Active (7d)"
						value={
							data.activeUsers7d > 0 ? (
								<span className="text-emerald-500">{data.activeUsers7d}</span>
							) : (
								0
							)
						}
					/>
					<Stat
						label="Events (30d)"
						value={numberFormat.format(data.events30d)}
					/>
					<Stat label="Orgs" value={data.totalOrgCount} />
					<Stat
						label="Paying orgs"
						value={
							data.payingOrgCount > 0 ? (
								<span className="text-sky-400">{data.payingOrgCount}</span>
							) : (
								0
							)
						}
					/>
				</CardContent>
			</Card>

			{data.orgs.length > 0 && (
				<div className="flex flex-wrap items-center gap-1.5">
					{data.orgs.map((org) => (
						<Link
							key={org.id}
							to="/companies/$orgId"
							params={{ orgId: org.id }}
						>
							<Badge
								variant="outline"
								className="hover:bg-accent max-w-48 truncate"
							>
								{org.isPaying && (
									<LuCircleDollarSign className="text-sky-400" />
								)}
								{org.name}
							</Badge>
						</Link>
					))}
					{data.totalOrgCount > data.orgs.length && (
						<Badge variant="outline">
							+{data.totalOrgCount - data.orgs.length} more
						</Badge>
					)}
				</div>
			)}

			<div className="grid gap-4 lg:grid-cols-3">
				<CompanyInfoCard domain={data.domain} />
				<div className="lg:col-span-2">
					<ActivityChart
						points={timeseries.data?.points}
						isLoading={timeseries.isLoading}
						error={timeseries.error}
						headerAction={<WeeksPicker value={weeks} onChange={setWeeks} />}
					/>
					{timeseries.data?.sampled && (
						<p className="text-muted-foreground mt-2 text-xs">
							Chart sampled from the 1,000 most recently active users
						</p>
					)}
				</div>
			</div>

			<DomainUsersTable users={data.users} totalUsers={data.totalUsers} />
		</div>
	);
}
