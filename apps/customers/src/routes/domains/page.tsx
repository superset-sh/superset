import type { RouterInputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LuSearch } from "react-icons/lu";

import { SnapshotNote } from "@/components/SnapshotNote";
import { useTRPC } from "@/trpc/react";

import { DomainsTable } from "./components/DomainsTable";

type DomainRollupInput = RouterInputs["customers"]["domainRollup"];

const PAGE_SIZE = 50;

export const Route = createFileRoute("/domains/")({
	component: DomainsPage,
});

function DomainsPage() {
	const trpc = useTRPC();

	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [minUsers, setMinUsers] = useState(2);
	const [includeFreemail, setIncludeFreemail] = useState(false);
	const [health, setHealth] = useState<DomainRollupInput["health"]>("all");
	const [trend, setTrend] = useState<DomainRollupInput["trend"]>("all");
	const [sort, setSort] = useState<DomainRollupInput["sort"]>("users");
	const [page, setPage] = useState(1);

	useEffect(() => {
		const timeout = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(timeout);
	}, [search]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination whenever a filter changes
	useEffect(() => {
		setPage(1);
	}, [debouncedSearch, minUsers, includeFreemail, health, trend, sort]);

	const { data, isLoading, isFetching, error } = useQuery(
		trpc.customers.domainRollup.queryOptions(
			{
				page,
				pageSize: PAGE_SIZE,
				search: debouncedSearch || undefined,
				minUsers,
				includeFreemail,
				health,
				trend,
				sort,
			},
			{ placeholderData: keepPreviousData },
		),
	);

	const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

	return (
		<div className="space-y-6">
			<div className="flex items-end justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Domains</h1>
					<p className="text-muted-foreground">
						Users grouped by email domain — spot multi-user companies without a
						formal org
					</p>
				</div>
				<SnapshotNote snapshotAt={data?.snapshotAt} />
			</div>

			<div className="flex flex-wrap items-center gap-6">
				<div className="relative">
					<LuSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search domains"
						className="w-56 pl-8"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Label htmlFor="min-users" className="text-muted-foreground text-sm">
						Min users
					</Label>
					<Select
						value={String(minUsers)}
						onValueChange={(value) => setMinUsers(Number(value))}
					>
						<SelectTrigger id="min-users" className="w-20">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{[1, 2, 3, 5, 10].map((count) => (
								<SelectItem key={count} value={String(count)}>
									{count}+
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<Select
					value={health}
					onValueChange={(value) =>
						setHealth(value as NonNullable<DomainRollupInput["health"]>)
					}
				>
					<SelectTrigger className="w-36">
						<SelectValue placeholder="Health" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All health</SelectItem>
						<SelectItem value="active">Active</SelectItem>
						<SelectItem value="idle">Idle</SelectItem>
						<SelectItem value="cooling">Cooling</SelectItem>
						<SelectItem value="dormant">Dormant</SelectItem>
						<SelectItem value="churnRisk">Churn risk</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={trend}
					onValueChange={(value) =>
						setTrend(value as NonNullable<DomainRollupInput["trend"]>)
					}
				>
					<SelectTrigger className="w-36">
						<SelectValue placeholder="Trend" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All trends</SelectItem>
						<SelectItem value="growing">Growing</SelectItem>
						<SelectItem value="declining">Declining</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={sort}
					onValueChange={(value) =>
						setSort(value as NonNullable<DomainRollupInput["sort"]>)
					}
				>
					<SelectTrigger className="w-44">
						<SelectValue placeholder="Sort" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="users">Most users</SelectItem>
						<SelectItem value="events30d">Most events (30d)</SelectItem>
						<SelectItem value="lastActive">Last active</SelectItem>
						<SelectItem value="trend">Best trend</SelectItem>
					</SelectContent>
				</Select>

				<div className="flex items-center gap-2">
					<Switch
						id="include-freemail"
						checked={includeFreemail}
						onCheckedChange={setIncludeFreemail}
					/>
					<Label
						htmlFor="include-freemail"
						className="text-muted-foreground text-sm"
					>
						Include freemail (gmail, outlook, …)
					</Label>
				</div>
			</div>

			<DomainsTable
				rows={data?.rows}
				total={data?.total}
				isLoading={isLoading}
				isFetching={isFetching}
				error={error}
			/>

			{data && data.total > PAGE_SIZE && (
				<div className="flex items-center justify-end gap-3">
					<span className="text-muted-foreground text-sm">
						Page {page} of {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => setPage((current) => current - 1)}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages}
						onClick={() => setPage((current) => current + 1)}
					>
						Next
					</Button>
				</div>
			)}
		</div>
	);
}
