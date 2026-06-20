import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { AutomationBody } from "./components/AutomationBody";
import { AutomationDetailHeader } from "./components/AutomationDetailHeader";
import { AutomationDetailSidebar } from "./components/AutomationDetailSidebar";
import { AutomationNoRunsPanel } from "./components/AutomationNoRunsPanel";
import { AutomationRunResultPanel } from "./components/AutomationRunResultPanel";
import { VersionHistorySheet } from "./components/VersionHistorySheet";
import { isAutomationRunTerminal } from "./utils/automationRunDisplay";
import {
	createOptimisticAutomationRun,
	mergeAutomationRuns,
	mergeSelectedAutomationRun,
	pickFreshestAutomationRun,
	resolveSelectedAutomationRunId,
} from "./utils/automationRunSelection";

type AutomationDetailSearch = {
	editPrompt?: boolean;
	history?: boolean;
	runId?: string;
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/$automationId/",
)({
	component: AutomationDetailPage,
	validateSearch: (search: Record<string, unknown>): AutomationDetailSearch => {
		const parsed: AutomationDetailSearch = {};
		if (search.editPrompt === true) parsed.editPrompt = true;
		if (search.history === true) parsed.history = true;
		if (typeof search.runId === "string") parsed.runId = search.runId;
		return parsed;
	},
});

const RECENT_RUNS_LIMIT = 10;

function isRunNowAccepted(status: string): boolean {
	return status === "dispatching" || status === "running";
}

function toOptimisticRunStatus(status: string): SelectAutomationRun["status"] {
	if (status === "running") return "running";
	if (status === "failed") return "failed";
	if (status === "skipped") return "skipped";
	return "dispatching";
}

function AutomationDetailPage() {
	const { automationId } = Route.useParams();
	const { editPrompt, history, runId } = Route.useSearch();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const collections = useCollections();
	const [historyOpen, setHistoryOpen] = useState(history ?? false);
	const [promptDraft, setPromptDraft] = useState("");
	const [reconciledRun, setReconciledRun] =
		useState<SelectAutomationRun | null>(null);
	const [automationPatch, setAutomationPatch] =
		useState<Partial<SelectAutomation> | null>(null);
	const lastPromptDraftAutomationIdRef = useRef<string | null>(null);
	const requestedRunId = runId ?? null;
	const isEditingPrompt = editPrompt === true;

	const { data: automationRows, isReady: automationReady } = useLiveQuery(
		(q) =>
			q
				.from({ a: collections.automations })
				.where(({ a }) => eq(a.id, automationId))
				.select(({ a }) => ({ ...a })),
		[collections.automations, automationId],
	);
	const liveAutomation = automationRows?.[0] as SelectAutomation | undefined;
	const freshAutomationQuery = useQuery({
		queryKey: ["automation", automationId],
		queryFn: () => apiTrpcClient.automation.get.query({ id: automationId }),
		retry: false,
	});
	const promptQuery = useQuery({
		queryKey: ["automation-prompt", automationId],
		queryFn: () =>
			apiTrpcClient.automation.getPrompt.query({ id: automationId }),
		enabled: !liveAutomation && !!freshAutomationQuery.data,
		retry: false,
	});
	const fetchedAutomation =
		freshAutomationQuery.data && (liveAutomation || promptQuery.data)
			? ({
					...freshAutomationQuery.data,
					prompt: liveAutomation?.prompt ?? promptQuery.data?.prompt ?? "",
				} as SelectAutomation)
			: undefined;
	const baseAutomation = fetchedAutomation ?? liveAutomation;
	const automation = baseAutomation
		? ({
				...(liveAutomation ?? {}),
				...(fetchedAutomation ?? {}),
				...(automationPatch ?? {}),
			} as SelectAutomation)
		: undefined;
	const automationPromptDraftId = automation?.id ?? null;
	const automationPromptDraftValue = automation?.prompt ?? "";

	useEffect(() => {
		if (!automationPromptDraftId) return;
		if (lastPromptDraftAutomationIdRef.current === automationPromptDraftId) {
			return;
		}
		lastPromptDraftAutomationIdRef.current = automationPromptDraftId;
		setPromptDraft(automationPromptDraftValue);
	}, [automationPromptDraftId, automationPromptDraftValue]);

	useEffect(() => {
		if (!automationPromptDraftId || isEditingPrompt) return;
		setPromptDraft(automationPromptDraftValue);
	}, [automationPromptDraftId, automationPromptDraftValue, isEditingPrompt]);

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
	const liveRecentRuns = runRows as SelectAutomationRun[];
	const recentRunsQuery = useQuery({
		queryKey: ["automation-runs", automationId, RECENT_RUNS_LIMIT],
		queryFn: () =>
			apiTrpcClient.automation.listRuns.query({
				automationId,
				limit: RECENT_RUNS_LIMIT,
			}),
		refetchInterval: (query) => {
			const fetchedRuns = (query.state.data ?? []) as SelectAutomationRun[];
			return fetchedRuns.some((run) => !isAutomationRunTerminal(run))
				? 3000
				: false;
		},
	});
	const fetchedRecentRuns = (recentRunsQuery.data ??
		[]) as SelectAutomationRun[];
	const recentRuns = mergeAutomationRuns(liveRecentRuns, fetchedRecentRuns);
	const selectedRunId = resolveSelectedAutomationRunId(
		requestedRunId,
		recentRuns,
	);
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
	const fetchedSelectedRun =
		selectedRunQuery.data?.id === selectedRunId
			? (selectedRunQuery.data as SelectAutomationRun)
			: null;
	const currentReconciledRun =
		reconciledRun?.id === selectedRunId ? reconciledRun : null;
	const selectedRunFromLiveAndFetch = pickFreshestAutomationRun(
		liveSelectedRun,
		fetchedSelectedRun,
	);
	const selectedRun = pickFreshestAutomationRun(
		selectedRunFromLiveAndFetch,
		currentReconciledRun,
	);
	const displayedRuns = mergeSelectedAutomationRun(recentRuns, selectedRun);
	const selectedRunIsTerminal = selectedRun
		? isAutomationRunTerminal(selectedRun)
		: true;

	useEffect(() => {
		if (!selectedRunId || selectedRunIsTerminal) {
			return;
		}
		let active = true;
		const reconcile = async () => {
			try {
				const run = (await apiTrpcClient.automation.reconcileRun.mutate({
					runId: selectedRunId,
				})) as SelectAutomationRun;
				if (!active) return;
				setReconciledRun((previous) =>
					pickFreshestAutomationRun(previous, run),
				);
			} catch (error) {
				console.warn("[AutomationDetail] reconcileRun failed", error);
			}
		};
		void reconcile();
		const interval = window.setInterval(reconcile, 30_000);
		return () => {
			active = false;
			window.clearInterval(interval);
		};
	}, [selectedRunId, selectedRunIsTerminal]);

	const setEnabledMutation = useMutation({
		mutationFn: (enabled: boolean) =>
			apiTrpcClient.automation.setEnabled.mutate({ id: automationId, enabled }),
		onSuccess: (updated) => {
			setAutomationPatch({
				enabled: updated.enabled,
				nextRunAt: updated.nextRunAt,
				updatedAt: updated.updatedAt,
			});
			void queryClient.invalidateQueries({ queryKey: ["automations", "list"] });
		},
	});

	const runNowMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.runNow.mutate({ id: automationId }),
		onSuccess: (result) => {
			if (result.runId) {
				if (!automation) {
					toast.error("Automation is still loading. Try again in a moment.");
					return;
				}
				const optimisticRun = createOptimisticAutomationRun({
					runId: result.runId,
					automation,
					status: toOptimisticRunStatus(result.status),
					error: result.error ?? null,
				});
				setReconciledRun(optimisticRun);
				queryClient.setQueryData<SelectAutomationRun[]>(
					["automation-runs", automationId, RECENT_RUNS_LIMIT],
					(existing) => mergeAutomationRuns(existing ?? [], [optimisticRun]),
				);
				navigate({
					to: "/automations/$automationId",
					params: { automationId },
					search: { runId: result.runId },
				});
				if (isRunNowAccepted(result.status)) {
					void queryClient.invalidateQueries({
						queryKey: ["automation-runs", automationId],
					});
					void queryClient.invalidateQueries({
						queryKey: ["automation", automationId],
					});
					toast.success(
						result.status === "dispatching"
							? "Automation run created"
							: "Automation run started",
					);
				} else {
					toast.error(result.error ?? "Automation run did not start");
				}
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

	const setPromptMutation = useMutation({
		mutationFn: (next: string) =>
			apiTrpcClient.automation.setPrompt.mutate({
				id: automationId,
				prompt: next,
			}),
	});

	if (!automation) {
		if (
			!automationReady ||
			freshAutomationQuery.isLoading ||
			promptQuery.isLoading
		) {
			return null;
		}
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground select-text cursor-text">
				Automation not found.
			</div>
		);
	}

	const returnRunId = selectedRunId ?? displayedRuns[0]?.id ?? null;
	const returnToAutomationDetails = () => {
		if (automation) {
			setPromptDraft(automation.prompt);
		}
		navigate({
			to: "/automations/$automationId",
			params: { automationId },
			search: returnRunId ? { runId: returnRunId } : {},
		});
	};

	const savePromptAndReturn = async () => {
		if (!automation) return;
		if (!promptDraft.trim()) {
			toast.error("Prompt cannot be empty");
			return;
		}

		try {
			if (promptDraft !== automation.prompt) {
				const updated = await setPromptMutation.mutateAsync(promptDraft);
				setAutomationPatch({
					prompt: updated.prompt,
					updatedAt: updated.updatedAt,
				});
				void queryClient.invalidateQueries({
					queryKey: ["automation-versions", automation.id],
				});
				void queryClient.invalidateQueries({
					queryKey: ["automation-prompt", automation.id],
				});
				void queryClient.invalidateQueries({
					queryKey: ["automation", automation.id],
				});
				void queryClient.invalidateQueries({
					queryKey: ["automations", "list"],
				});
			}
			navigate({
				to: "/automations/$automationId",
				params: { automationId },
				search: returnRunId ? { runId: returnRunId } : {},
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save prompt",
			);
		}
	};

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			<div className="flex flex-1 flex-col overflow-hidden">
				<AutomationDetailHeader
					name={automation.name}
					enabled={automation.enabled}
					mode={isEditingPrompt ? "editPrompt" : "detail"}
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
					onCancelPromptEdit={returnToAutomationDetails}
					onSavePrompt={() => void savePromptAndReturn()}
					toggleDisabled={setEnabledMutation.isPending}
					deleteDisabled={deleteMutation.isPending}
					runNowDisabled={runNowMutation.isPending}
					savePromptDisabled={!promptDraft.trim()}
					savePromptPending={setPromptMutation.isPending}
				/>

				{isEditingPrompt ? (
					<AutomationBody
						key={automation.id}
						automation={automation}
						prompt={promptDraft}
						onPromptChange={setPromptDraft}
						onSaveShortcut={() => void savePromptAndReturn()}
					/>
				) : selectedRunId ? (
					<AutomationRunResultPanel
						automation={automation}
						run={selectedRun}
						loading={selectedRunQuery.isLoading}
						onEditPrompt={() =>
							navigate({
								to: "/automations/$automationId",
								params: { automationId },
								search: { editPrompt: true, runId: selectedRunId },
							})
						}
					/>
				) : (
					<AutomationNoRunsPanel
						onEditPrompt={() =>
							navigate({
								to: "/automations/$automationId",
								params: { automationId },
								search: { editPrompt: true },
							})
						}
						onRunNow={() => runNowMutation.mutate()}
						runNowDisabled={runNowMutation.isPending}
					/>
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
