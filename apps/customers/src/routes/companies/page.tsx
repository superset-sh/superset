import { Button } from "@superset/ui/button";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { SnapshotNote } from "@/components/SnapshotNote";
import { useTRPC } from "@/trpc/react";

import { CompaniesTable } from "./components/CompaniesTable";
import {
	CompanyFilters,
	type CompanyListInput,
} from "./components/CompanyFilters";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/companies/")({
	component: CompaniesPage,
});

function CompaniesPage() {
	const trpc = useTRPC();

	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [plan, setPlan] = useState<CompanyListInput["plan"]>("all");
	const [health, setHealth] = useState<CompanyListInput["health"]>("all");
	const [scope, setScope] = useState<CompanyListInput["scope"]>("customers");
	const [sort, setSort] = useState<CompanyListInput["sort"]>("lastActive");
	const [page, setPage] = useState(1);

	useEffect(() => {
		const timeout = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(timeout);
	}, [search]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination whenever a filter changes
	useEffect(() => {
		setPage(1);
	}, [debouncedSearch, plan, health, scope, sort]);

	const { data, isLoading, isFetching, error } = useQuery(
		trpc.customers.listCompanies.queryOptions(
			{
				page,
				pageSize: PAGE_SIZE,
				search: debouncedSearch || undefined,
				plan,
				health,
				scope,
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
					<h1 className="text-3xl font-bold tracking-tight">Companies</h1>
					<p className="text-muted-foreground">
						Customer accounts with paying status and product activity
					</p>
				</div>
				<SnapshotNote snapshotAt={data?.snapshotAt} />
			</div>

			<CompanyFilters
				search={search}
				onSearchChange={setSearch}
				plan={plan}
				onPlanChange={setPlan}
				health={health}
				onHealthChange={setHealth}
				scope={scope}
				onScopeChange={setScope}
				sort={sort}
				onSortChange={setSort}
			/>

			<CompaniesTable
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
