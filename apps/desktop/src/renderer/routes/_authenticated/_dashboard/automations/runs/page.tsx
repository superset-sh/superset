import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
	LuArrowLeft,
	LuHistory,
	LuRotateCw,
	LuTriangleAlert,
} from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DATA_TABLE_HEAD_CELL } from "renderer/routes/_authenticated/_dashboard/components/DataTableHeader";
import { useFailedAutomations } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import { RunRow } from "./components/RunRow";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/runs/",
)({
	component: AutomationRunsPage,
	validateSearch: (search: Record<string, unknown>): { status?: "failed" } =>
		search.status === "failed" ? { status: "failed" } : {},
});

type Scope = "all" | "mine";
type StatusFilter = "all" | "failed";

const PAGE_SIZE = 50;

function AutomationRunsPage() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const { gateFeature } = usePaywall();

	const { markMyFailuresSeen } = useFailedAutomations();
	useEffect(() => {
		markMyFailuresSeen();
	}, [markMyFailuresSeen]);

	const { status: statusParam } = Route.useSearch();
	const [scope, setScope] = useState<Scope>("all");
	const [status, setStatus] = useState<StatusFilter>(statusParam ?? "all");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	const {
		data,
		isPending,
		isError,
		error,
		refetch,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = cloudTrpc.automation.listOrgRuns.useInfiniteQuery(
		{ limit: PAGE_SIZE, scope, status },
		{
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			refetchInterval: 60_000,
		},
	);

	const runs = useMemo(
		() => data?.pages.flatMap((page) => page.runs) ?? [],
		[data],
	);
	const runsById = useMemo(
		() => new Map(runs.map((run) => [run.id, run])),
		[runs],
	);

	const liveSelection = useMemo(
		() => [...selected].filter((id) => runsById.has(id)),
		[selected, runsById],
	);

	const selectedAutomationIds = useMemo(
		() => [
			...new Set(
				liveSelection.flatMap((id) => {
					const run = runsById.get(id);
					return run ? [run.automationId] : [];
				}),
			),
		],
		[liveSelection, runsById],
	);

	const selectableIds = useMemo(
		() => runs.filter((run) => run.canRetry).map((run) => run.id),
		[runs],
	);
	const allSelected =
		selectableIds.length > 0 && liveSelection.length === selectableIds.length;

	const toggleSelected = (id: string, next: boolean) =>
		setSelected((prev) => {
			const updated = new Set(prev);
			if (next) updated.add(id);
			else updated.delete(id);
			return updated;
		});

	const toggleExpanded = (id: string, next: boolean) =>
		setExpanded((prev) => {
			const updated = new Set(prev);
			if (next) updated.add(id);
			else updated.delete(id);
			return updated;
		});

	const runAgainMutation = useMutation({
		mutationFn: async (automationIds: string[]) => {
			const results = await Promise.allSettled(
				automationIds.map((id) =>
					apiTrpcClient.automation.runNow.mutate({ id }),
				),
			);
			return results;
		},
		onSuccess: (results) => {
			const failed = results.filter((r) => r.status === "rejected").length;
			const started = results.length - failed;
			if (started > 0) {
				toast.success(
					t({
						message: plural(started, {
							one: "Started # automation",
							other: "Started # automations",
						}),
					}),
				);
				setSelected(new Set());
			}
			if (failed > 0) {
				toast.error(
					t({
						message: plural(failed, {
							one: "# automation couldn't be started",
							other: "# automations couldn't be started",
						}),
					}),
				);
			}
			void utils.automation.listOrgRuns.invalidate();
			void utils.automation.latestRuns.invalidate();
		},
		onError: () =>
			toast.error(t({ message: "Failed to start the selected automations" })),
	});

	const columnCount = 6;
	const showLoading = isPending && runs.length === 0;
	const showError = isError && runs.length === 0;

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="drag h-10 shrink-0" />

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 pb-12">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-1.5">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								onClick={() => navigate({ to: "/automations" })}
								aria-label={t({ message: "Back to automations" })}
							>
								<LuArrowLeft className="size-4" />
							</Button>
							<h1 className="font-semibold text-xl tracking-tight">
								<Trans>All runs</Trans>
							</h1>
						</div>
						<a
							href={`${COMPANY.DOCS_URL}/automations`}
							target="_blank"
							rel="noreferrer"
							className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
						>
							<Trans>Automation docs</Trans>
						</a>
					</div>

					<div className="mt-6 flex flex-wrap items-center justify-between gap-2">
						<Tabs
							value={scope}
							onValueChange={(value) => {
								if (value) setScope(value as Scope);
							}}
						>
							<TabsList className="h-8 gap-1 bg-transparent p-0">
								<TabsTrigger
									value="all"
									className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
								>
									<span className="text-sm">
										<Trans>All</Trans>
									</span>
								</TabsTrigger>
								<TabsTrigger
									value="mine"
									className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
								>
									<span className="text-sm">
										<Trans>Mine</Trans>
									</span>
								</TabsTrigger>
							</TabsList>
						</Tabs>

						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant={status === "failed" ? "default" : "outline"}
								size="sm"
								className="h-8 gap-1.5 px-3"
								onClick={() =>
									setStatus((prev) => (prev === "failed" ? "all" : "failed"))
								}
							>
								<LuTriangleAlert className="size-3.5" />
								<Trans>Needs a retry</Trans>
							</Button>
							{selectedAutomationIds.length > 0 && (
								<Button
									type="button"
									size="sm"
									className="h-8 gap-1.5 px-3"
									disabled={runAgainMutation.isPending}
									onClick={() =>
										gateFeature(GATED_FEATURES.AUTOMATIONS, () =>
											runAgainMutation.mutate(selectedAutomationIds),
										)
									}
								>
									<LuRotateCw
										className={cn(
											"size-3.5",
											runAgainMutation.isPending && "animate-spin",
										)}
									/>
									<Trans>Run again</Trans>
									<span className="tabular-nums text-xs opacity-70">
										{selectedAutomationIds.length}
									</span>
								</Button>
							)}
						</div>
					</div>

					<div className="mt-3">
						{showLoading ? (
							<div className="space-y-2">
								{["a", "b", "c", "d", "e", "f"].map((key) => (
									<Skeleton key={key} className="h-10 w-full" />
								))}
							</div>
						) : showError ? (
							<Empty className="rounded-xl border border-border py-16">
								<EmptyHeader>
									<EmptyMedia
										variant="icon"
										className="size-14 [&_svg:not([class*='size-'])]:size-7"
									>
										<LuTriangleAlert />
									</EmptyMedia>
									<EmptyTitle>
										<Trans>Couldn't load runs</Trans>
									</EmptyTitle>
									<EmptyDescription className="select-text cursor-text">
										{error instanceof Error ? (
											error.message
										) : (
											<Trans>The request failed.</Trans>
										)}
									</EmptyDescription>
								</EmptyHeader>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										void refetch();
									}}
								>
									<LuRotateCw className="size-4" />
									<Trans>Try again</Trans>
								</Button>
							</Empty>
						) : runs.length === 0 ? (
							<Empty className="rounded-xl border border-border py-16">
								<EmptyHeader>
									<EmptyMedia
										variant="icon"
										className="size-14 [&_svg:not([class*='size-'])]:size-7"
									>
										<LuHistory />
									</EmptyMedia>
									<EmptyTitle>
										{status === "failed" ? (
											<Trans>Nothing needs a retry</Trans>
										) : (
											<Trans>No runs yet</Trans>
										)}
									</EmptyTitle>
									<EmptyDescription>
										{status === "failed" ? (
											<Trans>Every run so far reached a host.</Trans>
										) : (
											<Trans>Runs appear here once an automation fires.</Trans>
										)}
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<div className="rounded-xl border border-border">
								<Table className="table-fixed">
									<TableHeader className="sticky top-0 z-10 shadow-[inset_0_-1px_0_0_var(--color-border)] [&_th]:bg-background [&_tr>th:first-child]:rounded-tl-xl [&_tr>th:last-child]:rounded-tr-xl [&_tr]:border-b-0">
										<TableRow className="hover:bg-transparent">
											<TableHead
												className={cn(DATA_TABLE_HEAD_CELL, "w-12 pl-4")}
											>
												<Checkbox
													checked={allSelected}
													onCheckedChange={(next) =>
														setSelected(
															next === true
																? new Set(selectableIds)
																: new Set(),
														)
													}
													disabled={selectableIds.length === 0}
													aria-label={t({ message: "Select every run" })}
												/>
											</TableHead>
											<TableHead className={DATA_TABLE_HEAD_CELL}>
												<Trans>Automation</Trans>
											</TableHead>
											<TableHead
												className={cn(DATA_TABLE_HEAD_CELL, "w-[14%]")}
											>
												<Trans>Trigger</Trans>
											</TableHead>
											<TableHead
												className={cn(DATA_TABLE_HEAD_CELL, "w-[20%]")}
											>
												<Trans>Started</Trans>
											</TableHead>
											<TableHead
												className={cn(DATA_TABLE_HEAD_CELL, "w-[20%]")}
											>
												<Trans>Status</Trans>
											</TableHead>
											<TableHead
												className={cn(DATA_TABLE_HEAD_CELL, "w-24 pr-4")}
											/>
										</TableRow>
									</TableHeader>
									<TableBody>
										{runs.map((run) => (
											<RunRow
												key={run.id}
												run={run}
												selected={selected.has(run.id)}
												onSelectedChange={(next) =>
													toggleSelected(run.id, next)
												}
												expanded={expanded.has(run.id)}
												onExpandedChange={(next) =>
													toggleExpanded(run.id, next)
												}
												columnCount={columnCount}
											/>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</div>

					{hasNextPage && (
						<div className="mt-4 flex justify-center">
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isFetchingNextPage}
								onClick={() => {
									void fetchNextPage();
								}}
							>
								{isFetchingNextPage ? (
									<Trans>Loading…</Trans>
								) : (
									<Trans>Load more</Trans>
								)}
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
