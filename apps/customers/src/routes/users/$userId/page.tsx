import { getInitials } from "@superset/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
import { Card, CardContent } from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import { useState } from "react";
import {
	LuArrowLeft,
	LuCircleDollarSign,
	LuMessageSquare,
	LuMonitor,
	LuTerminal,
} from "react-icons/lu";

import { ActivityChart } from "@/components/ActivityChart";
import { HealthBadge } from "@/components/HealthBadge";
import { SnapshotNote } from "@/components/SnapshotNote";
import { TrendCell } from "@/components/TrendCell";
import { WeeksPicker } from "@/components/WeeksPicker";
import { useTRPC } from "@/trpc/react";

import { UserRoleLine } from "./components/UserRoleLine";

export const Route = createFileRoute("/users/$userId/")({
	component: UserDetailPage,
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

const SURFACES = [
	{ key: "desktop", label: "Desktop", icon: LuMonitor },
	{ key: "cli", label: "CLI", icon: LuTerminal },
	{ key: "chat", label: "Chat / agents", icon: LuMessageSquare },
] as const;

function UserDetailPage() {
	const { userId } = Route.useParams();
	const trpc = useTRPC();
	const router = useRouter();

	const [weeks, setWeeks] = useState(12);
	const detail = useQuery(trpc.customers.userDetail.queryOptions({ userId }));
	const timeseries = useQuery(
		trpc.customers.userActivityTimeseries.queryOptions({ userId, weeks }),
	);

	if (detail.isLoading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-16 w-96" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (detail.error || !detail.data) {
		return (
			<Card>
				<CardContent className="py-12 text-center">
					<p className="text-lg font-medium">Failed to load user</p>
					<p className="text-muted-foreground text-sm">
						{detail.error?.message ?? "User not found"}
					</p>
				</CardContent>
			</Card>
		);
	}

	const data = detail.data;
	const totalSurfaceEvents =
		data.surfaces.desktop + data.surfaces.cli + data.surfaces.chat;

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between">
				<div className="space-y-3">
					<button
						type="button"
						onClick={() => router.history.back()}
						className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
					>
						<LuArrowLeft className="size-3.5" />
						Back
					</button>
					<div className="flex items-center gap-4">
						<Avatar className="size-12">
							<AvatarImage src={data.user.image ?? undefined} />
							<AvatarFallback>
								{getInitials(data.user.name, data.user.email)}
							</AvatarFallback>
						</Avatar>
						<div>
							<div className="flex items-center gap-3">
								<h1 className="text-3xl font-bold tracking-tight">
									{data.user.name}
								</h1>
								<HealthBadge health={data.health} churnRisk={data.churnRisk} />
							</div>
							<p className="text-muted-foreground text-sm">
								{data.user.email} · signed up{" "}
								{format(data.user.createdAt, "MMM d, yyyy")} ·{" "}
								{data.user.onboardedAt ? "onboarded" : "not onboarded"} · last
								active{" "}
								{data.lastActiveAt
									? formatDistanceToNow(data.lastActiveAt, { addSuffix: true })
									: "never"}
							</p>
						</div>
					</div>
					<UserRoleLine userId={userId} autoResearch={data.autoResearch} />
				</div>
				<SnapshotNote snapshotAt={data.snapshotAt} />
			</div>

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
								<span className="text-muted-foreground">· {org.role}</span>
							</Badge>
						</Link>
					))}
				</div>
			)}

			<Card>
				<CardContent className="flex flex-wrap items-center gap-x-12 gap-y-4">
					<Stat
						label="Events (7d)"
						value={numberFormat.format(data.events7d)}
					/>
					<Stat
						label="Events (30d)"
						value={numberFormat.format(data.events30d)}
					/>
					<Stat
						label="Trend (30d)"
						value={
							<TrendCell
								trendPct={data.trendPct}
								events30d={data.events30d}
								events30dPrev={data.events30dPrev}
							/>
						}
					/>
					<Stat label="Active days (30d)" value={data.activeDays30} />
					{SURFACES.map((surface) => (
						<Stat
							key={surface.key}
							label={surface.label}
							value={
								<span className="flex items-center gap-1.5">
									<surface.icon className="text-muted-foreground size-4" />
									{totalSurfaceEvents > 0
										? `${Math.round(
												(data.surfaces[surface.key] / totalSurfaceEvents) * 100,
											)}%`
										: "—"}
								</span>
							}
						/>
					))}
				</CardContent>
			</Card>

			{!data.hasActivityData && (
				<Card>
					<CardContent className="py-6">
						<p className="text-muted-foreground text-sm">
							No product activity recorded in the last 90 days
							{Date.now() - data.user.createdAt.getTime() <
							14 * 24 * 60 * 60 * 1000
								? " — recently signed up, data may still be arriving."
								: "."}
						</p>
					</CardContent>
				</Card>
			)}

			<ActivityChart
				points={timeseries.data?.points}
				isLoading={timeseries.isLoading}
				error={timeseries.error}
				headerAction={<WeeksPicker value={weeks} onChange={setWeeks} />}
			/>
		</div>
	);
}
