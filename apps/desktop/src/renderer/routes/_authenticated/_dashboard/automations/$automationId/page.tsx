import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { AutomationBody } from "./components/AutomationBody";
import { AutomationDetailHeader } from "./components/AutomationDetailHeader";
import { AutomationDetailSidebar } from "./components/AutomationDetailSidebar";
import { AutomationRunResultPanel } from "./components/AutomationRunResultPanel";
import { VersionHistorySheet } from "./components/VersionHistorySheet";
import { isAutomationRunTerminal } from "./utils/automationRunDisplay";
import {
	mergeSelectedAutomationRun,
	pickFreshestAutomationRun,
} from "./utils/automationRunSelection";

type AutomationDetailSearch = {
	history?: boolean;
	runId?: string;
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/$automationId/",
)({
	component: AutomationDetailPage,
	validateSearch: (
		search: Record<string, unknown>,
	): AutomationDetailSearch => ({
		history: search.history === true,
		runId: typeof search.runId === "string" ? search.runId : undefined,
	}),
});

const RECENT_RUNS_LIMIT = 10;

function AutomationDetailPage() {
	const { automationId } = Route.useParams();
	const { history, runId } = Route.useSearch();
	const navigate = useNavigate();
	const collections = useCollections();
	const [historyOpen, setHistoryOpen] = useState(history ?? false);
	const selectedRunId = runId ?? null;

	const { data: automationRows, isReady: automationReady } = useLiveQuery(
		(q) =>
			q
				.from({ a: collections.automations })
				.where(({ a }) => eq(a.id, automationId))
				.select(({ a }) => ({ ...a })),
		[collections.automations, automationId],
	);
	const automation = automationRows?.[0] as SelectAutomation | undefined;

	const { data: runRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ r: collections.automationRuns })
				.where(({ r }) => eq(r.automationId, automationId))
				.orderBy(({ r }) => r.createdAt, "desc")
				.limit(RECENT_RUNS_LIMIT)
				.select(({ r }) => ({ ...r })),
		[collections.automationRuns, automationId],
	);
	const recentRuns = runRows as SelectAutomationRun[];
	const liveSelectedRun =
		recentRuns.find((run) => run.id === selectedRunId) ?? null;

	const selectedRunQuery = useQuery({
		queryKey: ["automation-run", selectedRunId],
		queryFn: () =>
			apiTrpcClient.automation.getRun.query({ runId: selectedRunId ?? "" }),
		enabled: !!selectedRunId,
		refetchInterval: (query) => {
			const fetchedRun = query.state.data as SelectAutomationRun | undefined;
			const freshestRun = pickFreshestAutomationRun(
				liveSelectedRun,
				fetchedRun ?? null,
			);
			return freshestRun && !isAutomationRunTerminal(freshestRun)
				? 3000
				: false;
		},
	});
	const selectedRun = pickFreshestAutomationRun(
		liveSelectedRun,
		(selectedRunQuery.data as SelectAutomationRun | undefined) ?? null,
	);
	const displayedRuns = mergeSelectedAutomationRun(recentRuns, selectedRun);

	const setEnabledMutation = useMutation({
		mutationFn: (enabled: boolean) =>
			apiTrpcClient.automation.setEnabled.mutate({ id: automationId, enabled }),
	});

	const runNowMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.runNow.mutate({ id: automationId }),
		onSuccess: (result) => {
			if (result.runId) {
				navigate({
					to: "/automations/$automationId",
					params: { automationId },
					search: { runId: result.runId },
				});
				toast.success("Automation run started");
				return;
			}
			toast.error(result.error ?? "Automation run did not start");
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to trigger run",
			),
	});

	const deleteMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.delete.mutate({ id: automationId }),
		onSuccess: () => navigate({ to: "/automations" }),
	});

	if (!automation) {
		if (!automationReady) return null;
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground select-text cursor-text">
				Automation not found.
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			<div className="flex flex-1 flex-col overflow-hidden">
				<AutomationDetailHeader
					name={automation.name}
					enabled={automation.enabled}
					onBack={() => navigate({ to: "/automations" })}
					onToggleEnabled={() => setEnabledMutation.mutate(!automation.enabled)}
					onDelete={() => {
						alert({
							title: "Delete automation?",
							description: `"${automation.name}" will stop firing and its run history will be removed. This can't be undone.`,
							actions: [
								{ label: "Cancel", variant: "outline", onClick: () => {} },
								{
									label: "Delete",
									variant: "destructive",
									onClick: () => {
										toast.promise(deleteMutation.mutateAsync(), {
											loading: "Deleting automation...",
											success: `"${automation.name}" deleted`,
											error: (err) =>
												err instanceof Error
													? err.message
													: "Failed to delete automation",
										});
									},
								},
							],
						});
					}}
					onRunNow={() => runNowMutation.mutate()}
					onOpenHistory={() => setHistoryOpen(true)}
					toggleDisabled={setEnabledMutation.isPending}
					deleteDisabled={deleteMutation.isPending}
					runNowDisabled={runNowMutation.isPending}
				/>

				{selectedRunId ? (
					<AutomationRunResultPanel
						automation={automation}
						run={selectedRun}
						loading={selectedRunQuery.isLoading}
						onEditPrompt={() =>
							navigate({
								to: "/automations/$automationId",
								params: { automationId },
								search: {},
							})
						}
					/>
				) : (
					<AutomationBody key={automation.id} automation={automation} />
				)}
			</div>

			<AutomationDetailSidebar
				automation={automation}
				recentRuns={displayedRuns}
				selectedRunId={selectedRunId}
				onSelectRun={(nextRunId) =>
					navigate({
						to: "/automations/$automationId",
						params: { automationId },
						search: { runId: nextRunId },
					})
				}
			/>

			<VersionHistorySheet
				key={automation.id}
				automationId={automation.id}
				automationName={automation.name}
				currentPrompt={automation.prompt}
				open={historyOpen}
				onOpenChange={setHistoryOpen}
			/>
		</div>
	);
}
