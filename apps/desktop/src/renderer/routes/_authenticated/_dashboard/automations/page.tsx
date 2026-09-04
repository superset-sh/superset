import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { COMPANY } from "@superset/shared/constants";
import { describeSchedule } from "@superset/shared/rrule";
import type { RouterOutputs } from "@superset/trpc";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { Input } from "@superset/ui/input";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	LuCircleHelp,
	LuPlus,
	LuRotateCw,
	LuSearch,
	LuSearchX,
	LuSparkles,
	LuTerminal,
	LuTriangleAlert,
	LuX,
} from "react-icons/lu";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import { useNow } from "renderer/hooks/useNow";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DATA_TABLE_HEAD_CELL } from "renderer/routes/_authenticated/_dashboard/components/DataTableHeader";
import {
	SortableHeader,
	type SortDirection,
} from "renderer/routes/_authenticated/_dashboard/components/SortableHeader";
import { useFailedAutomations } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { AutomationRow } from "./components/AutomationRow";
import { AutomationStatCards } from "./components/AutomationStatCards";
import { AutomationsEmptyState } from "./components/AutomationsEmptyState";
import { HostOfflineRunDialog } from "./components/HostOfflineRunDialog";
import type { AutomationTemplate } from "./templates";
import { matchAgentChoice, portableAgentValue } from "./utils/agentIdentity";
import { isHostOfflineError } from "./utils/hostOfflineError";
import { isStaleAgentError, STALE_AGENT_HELP } from "./utils/staleAgentError";

export const Route = createFileRoute("/_authenticated/_dashboard/automations/")(
	{
		component: AutomationsPage,
	},
);

type Scope = "mine" | "team";

type AutomationListItem = RouterOutputs["automation"]["list"][number];

type AutomationSortField = "name" | "owner" | "schedule" | "status";

// Seeds the "Create with AI" agent session. The skill is provisioned as
// superset:automate; mentioning it by name loads it (it isn't in the chat
// slash-command allowlist).
const AUTOMATION_AGENT_PROMPT =
	"Help me create a Superset automation. Use the superset:automate skill if it's available, otherwise the `superset` CLI (start with `superset automations --help`). Ask me what should run on a schedule, confirm the cadence, target project, and agent, then create the automation and trigger a first run so we can review the result together.";

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function settledErrorMessage(result: PromiseSettledResult<unknown>) {
	return result.status === "rejected" && result.reason instanceof Error
		? result.reason.message
		: null;
}

function AutomationsPage() {
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;

	const [scope, setScope] = useState<Scope>("mine");
	const [search, setSearch] = useState("");
	const [cliHintDismissed, setCliHintDismissed] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<AutomationListItem | null>(
		null,
	);
	const [hostOfflineRun, setHostOfflineRun] = useState<{
		hostId: string | null;
	} | null>(null);
	const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

	const addRetrying = useCallback((ids: string[]) => {
		setRetryingIds((prev) => {
			const next = new Set(prev);
			for (const id of ids) next.add(id);
			return next;
		});
	}, []);
	const removeRetrying = useCallback((ids: string[]) => {
		setRetryingIds((prev) => {
			const next = new Set(prev);
			for (const id of ids) next.delete(id);
			return next;
		});
	}, []);

	const runNowMutation = useMutation({
		mutationFn: ({
			id,
		}: {
			id: string;
			name: string;
			targetHostId: string | null;
		}) => apiTrpcClient.automation.runNow.mutate({ id }),
		onMutate: ({ id }) => addRetrying([id]),
		onSettled: (_data, _error, { id }) => removeRetrying([id]),
		onSuccess: (_, { name }) =>
			toast.success(
				t({
					message: `Running "${name}" now`,
				}),
			),
		onError: (error, { targetHostId }) => {
			const message = error instanceof Error ? error.message : null;
			if (isHostOfflineError(message)) {
				setHostOfflineRun({ hostId: targetHostId });
				return;
			}
			if (isStaleAgentError(message)) {
				toast.error(i18n._(STALE_AGENT_HELP));
				return;
			}
			toast.error(
				message ??
					t({
						message: "Failed to trigger run",
					}),
			);
		},
	});

	const retryAllMutation = useMutation({
		mutationFn: async (targets: AutomationListItem[]) => {
			const results = await Promise.allSettled(
				targets.map((a) =>
					apiTrpcClient.automation.runNow.mutate({ id: a.id }),
				),
			);
			return targets.map((automation, i) => ({
				automation,
				result: results[i],
			}));
		},
		onMutate: (targets) => addRetrying(targets.map((a) => a.id)),
		onSettled: (_data, _error, targets) =>
			removeRetrying(targets.map((a) => a.id)),
		onSuccess: (outcomes) => {
			const failed = outcomes.filter((o) => o.result.status === "rejected");
			const retried = outcomes.length - failed.length;
			if (retried > 0) {
				toast.success(
					t({
						message: plural(retried, {
							one: "Retrying # automation",
							other: "Retrying # automations",
						}),
					}),
				);
			}
			if (failed.length === 0) return;
			const offline = failed.find((o) =>
				isHostOfflineError(settledErrorMessage(o.result)),
			);
			if (offline) {
				setHostOfflineRun({ hostId: offline.automation.targetHostId });
			}
			// The host-offline dialog explains those failures; only toast the rest.
			const other = failed.filter(
				(o) => !isHostOfflineError(settledErrorMessage(o.result)),
			);
			if (other.length === 0) return;
			const message = settledErrorMessage(other[0].result);
			const failedCount = other.length;
			const totalCount = outcomes.length;
			toast.error(
				other.length === 1
					? isStaleAgentError(message)
						? i18n._(STALE_AGENT_HELP)
						: (message ??
							t({
								message: "Failed to retry automation",
							}))
					: t({
							message: `Failed to retry ${failedCount} of ${totalCount} automations`,
						}),
			);
		},
	});

	const utils = cloudTrpc.useUtils();

	const setEnabledMutation = useMutation({
		mutationFn: ({
			id,
			enabled,
		}: {
			id: string;
			enabled: boolean;
			name: string;
		}) => apiTrpcClient.automation.setEnabled.mutate({ id, enabled }),
		onSuccess: (_, { id, enabled, name }) => {
			void utils.automation.list.invalidate();
			void utils.automation.get.invalidate({ id });
			toast.success(
				enabled
					? t({
							message: `"${name}" resumed`,
						})
					: t({
							message: `"${name}" paused`,
						}),
			);
		},
		onError: (error) =>
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to update automation",
					}),
				),
			),
	});

	const deleteMutation = useMutation({
		mutationFn: ({ id }: { id: string; name: string }) =>
			apiTrpcClient.automation.delete.mutate({ id }),
		onSuccess: (_, { name }) => {
			void utils.automation.list.invalidate();
			setPendingDelete(null);
			toast.success(
				t({
					message: `"${name}" deleted`,
				}),
			);
		},
		onError: (error) =>
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to delete automation",
					}),
				),
			),
	});

	const {
		data: automations = [],
		isPending: automationsPending,
		isError: automationsFailed,
		error: automationsError,
		refetch: refetchAutomations,
	} = cloudTrpc.automation.list.useQuery(undefined, {
		refetchInterval: 15_000,
	});

	const { data: memberRows = [] } = cloudTrpc.organization.listMembers.useQuery(
		undefined,
		{},
	);
	const { lastRunById, failedIds, markMyFailuresSeen } = useFailedAutomations();
	const now = useNow(30_000);

	// Opening the page clears the sidebar failure badge; failures that sync in
	// while it stays open are marked seen too, until a newer run fails.
	useEffect(() => {
		markMyFailuresSeen();
	}, [markMyFailuresSeen]);

	const recentProjects = useRecentProjects();

	const usersById = useMemo(
		() => new Map(memberRows.map((member) => [member.user.id, member.user])),
		[memberRows],
	);
	const projectsById = useMemo(
		() =>
			new Map(recentProjects.filter((p) => p != null).map((p) => [p.id, p])),
		[recentProjects],
	);

	const mineCount = useMemo(
		() =>
			currentUserId
				? automations.filter((a) => a.ownerUserId === currentUserId).length
				: 0,
		[automations, currentUserId],
	);
	const teamCount = automations.length - mineCount;

	// Only owned automations can be retried; runNow is owner-gated server-side.
	const failedMine = useMemo(
		() =>
			currentUserId
				? automations.filter(
						(a) => a.ownerUserId === currentUserId && failedIds.has(a.id),
					)
				: [],
		[automations, currentUserId, failedIds],
	);

	const tabVisible = useMemo(() => {
		if (!currentUserId) return automations;
		return scope === "mine"
			? automations.filter((a) => a.ownerUserId === currentUserId)
			: automations.filter((a) => a.ownerUserId !== currentUserId);
	}, [automations, scope, currentUserId]);

	// Clicking the "Failed" stat card narrows the table to failing automations.
	const [failedOnly, setFailedOnly] = useState(false);
	const failedInTab = useMemo(
		() => tabVisible.filter((a) => failedIds.has(a.id)),
		[tabVisible, failedIds],
	);
	// The filter clears itself once nothing is failing anymore.
	useEffect(() => {
		if (failedOnly && failedInTab.length === 0) setFailedOnly(false);
	}, [failedOnly, failedInTab.length]);
	const visible = useMemo(() => {
		const base = failedOnly ? failedInTab : tabVisible;
		const query = search.trim().toLowerCase();
		if (!query) return base;
		return base.filter((a) => a.name.toLowerCase().includes(query));
	}, [failedOnly, failedInTab, tabVisible, search]);

	// Counts the latest run per automation, the only run history the cloud
	// serves for a whole org in one read.
	const runStats = useMemo(() => {
		const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
		let created7d = 0;
		let failed7d = 0;
		for (const automation of tabVisible) {
			const run = lastRunById.get(automation.id);
			if (!run || run.at < cutoff) continue;
			if (run.status === "dispatched") created7d++;
			else if (
				run.status === "dispatch_failed" ||
				run.status === "skipped_offline"
			)
				failed7d++;
		}
		return {
			created7d,
			failed7d,
			active: tabVisible.filter((a) => a.enabled).length,
		};
	}, [lastRunById, tabVisible, now]);

	const [sortField, setSortField] = useState<AutomationSortField | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	const handleSort = (field: AutomationSortField) => {
		if (sortField === field) {
			setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortField(field);
			setSortDirection("asc");
		}
	};

	const handleScopeChange = (value: string) => {
		if (!value) return;
		const next = value as Scope;
		setScope(next);
		// The Owner column only exists on the team tab; drop the sort with it.
		if (next !== "team" && sortField === "owner") setSortField(null);
	};

	const sortedVisible = useMemo(() => {
		if (!sortField) return visible;
		const sortValue = (automation: AutomationListItem): string => {
			switch (sortField) {
				case "name":
					return automation.name;
				case "owner": {
					const owner = usersById.get(automation.ownerUserId);
					return owner?.name ?? owner?.email ?? "";
				}
				case "schedule":
					return automation.rrule
						? describeSchedule(automation.rrule)
						: automation.triggerCount > 0
							? "Event triggered"
							: "No triggers";
				case "status":
					return automation.enabled ? "active" : "paused";
			}
		};
		return [...visible].sort((a, b) => {
			const cmp = sortValue(a).localeCompare(sortValue(b));
			return sortDirection === "asc" ? cmp : -cmp;
		});
	}, [visible, sortField, sortDirection, usersById]);

	// Default (unsorted) view groups rows Codex-style: failing automations
	// pinned on top, then soonest run first, paused in their own section.
	const needsAttention = useMemo(
		() => visible.filter((a) => failedIds.has(a.id)),
		[visible, failedIds],
	);
	const upNext = useMemo(
		() =>
			visible
				.filter((a) => a.enabled && !failedIds.has(a.id))
				.slice()
				.sort((a, b) => {
					const at = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Infinity;
					const bt = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Infinity;
					return at - bt;
				}),
		[visible, failedIds],
	);
	const pausedVisible = useMemo(
		() => visible.filter((a) => !a.enabled && !failedIds.has(a.id)),
		[visible, failedIds],
	);

	const navigate = useNavigate();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { agents: agentChoices } = useV2AgentChoices(activeHostUrl);
	const { submit: submitWorkspaceCreate } = useWorkspaceCreates();

	// Cursor-style creation: no dialog. "New automation" writes an untitled
	// automation with no triggers and opens its detail page, which is the
	// editor; a template pre-fills name/prompt/schedule the same way.
	const createMutation = useMutation({
		mutationFn: (template: AutomationTemplate | null) => {
			const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
			// Template preference first (iconId is a legacy fallback, as in the
			// old dialog), then the last-used agent, then the first host agent.
			const choice =
				(template?.agentType
					? (matchAgentChoice(agentChoices, template.agentType) ??
						agentChoices.find((option) => option.iconId === template.agentType))
					: null) ??
				(stored ? matchAgentChoice(agentChoices, stored) : null) ??
				agentChoices[0];
			if (!choice) throw new Error("No agent available yet");
			return apiTrpcClient.automation.create.mutate({
				name: template
					? i18n._(template.name)
					: t({
							message: "Untitled",
						}),
				prompt: template?.prompt ?? "",
				// Preset slug when unambiguous — instance UUIDs die when the host's
				// agent-config table is re-seeded, orphaning the automation.
				agent: portableAgentValue(agentChoices, choice),
				targetHostId: machineId ?? null,
				v2ProjectId: recentProjects.find((p) => p != null)?.id ?? null,
				...(template?.rrule
					? { rrule: template.rrule, timezone: DEFAULT_TIMEZONE }
					: { triggers: [] }),
			});
		},
		onSuccess: (result) => {
			void utils.automation.list.invalidate();
			void navigate({
				to: "/automations/$automationId",
				params: { automationId: result.id },
			});
		},
		onError: (error) => {
			// Raw Postgres errors are multi-line SQL dumps — keep the first line.
			const message =
				error instanceof Error ? error.message.split("\n")[0]?.trim() : null;
			toast.error(
				message ||
					t({
						message: "Failed to create automation",
					}),
			);
		},
	});

	const handleSelectTemplate = (template: AutomationTemplate) => {
		if (createMutation.isPending) return;
		createMutation.mutate(template);
	};

	// Opens a project-less agent session seeded with automation-creation
	// instructions. The in-app "superset" chat agent can't run the CLI, so
	// pick the user's last terminal agent (composer behavior).
	const [creatingWithAgent, setCreatingWithAgent] = useState(false);
	const handleCreateWithAgent = () => {
		if (creatingWithAgent) return;
		if (!machineId) {
			toast.error(
				t({
					message: "Host service is not running",
				}),
			);
			return;
		}
		const terminalAgents = agentChoices.filter((a) => a.id !== "superset");
		const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
		const agent =
			terminalAgents.find((a) => a.id === stored)?.id ?? terminalAgents[0]?.id;
		if (!agent) {
			toast.error(
				t({
					message: "No terminal agent is configured on this device",
				}),
			);
			return;
		}
		setCreatingWithAgent(true);
		const { workspaceId, completed } = submitWorkspaceCreate({
			hostId: machineId,
			snapshot: {
				id: crypto.randomUUID(),
				projectId: null,
				agents: [{ agent, prompt: AUTOMATION_AGENT_PROMPT }],
			},
		});
		// The store shows creation failures on the optimistic sidebar row; this
		// just re-arms the button if the user navigates back.
		void completed.finally(() => setCreatingWithAgent(false));
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId },
		}).catch(() => {});
	};

	const scheduleWidth = scope === "team" ? "w-[16%]" : "w-[18%]";
	const lastRunWidth = "w-[14%]";
	const statusWidth = scope === "team" ? "w-[12%]" : "w-[13%]";
	const columnCount = scope === "team" ? 6 : 5;
	const showAutomationLoading = automationsPending && tabVisible.length === 0;
	// A failed read has no rows either, but it is not an empty org — it must not
	// strip the page chrome or claim the org has no automations.
	const showAutomationError = automationsFailed && automations.length === 0;
	// True first run: nothing in the org — stats/tabs/search are noise.
	const orgEmpty =
		!automationsPending && !showAutomationError && automations.length === 0;
	const tabEmpty =
		!automationsPending && !showAutomationError && tabVisible.length === 0;
	const showMineEmptyState = tabEmpty && scope === "mine";
	const showTeamEmptyState = tabEmpty && scope === "team";

	const renderAutomationRow = (automation: AutomationListItem) => (
		<AutomationRow
			key={automation.id}
			automation={automation}
			owner={usersById.get(automation.ownerUserId)}
			showOwner={scope === "team"}
			project={
				automation.v2ProjectId === null
					? undefined
					: projectsById.get(automation.v2ProjectId)
			}
			isSession={automation.v2ProjectId === null}
			lastRun={lastRunById.get(automation.id) ?? null}
			now={now}
			isOwner={automation.ownerUserId === currentUserId}
			isRetrying={retryingIds.has(automation.id)}
			onRunNow={(a) =>
				runNowMutation.mutate({
					id: a.id,
					name: a.name,
					targetHostId: a.targetHostId,
				})
			}
			onToggleEnabled={(a) =>
				setEnabledMutation.mutate({
					id: a.id,
					enabled: !a.enabled,
					name: a.name,
				})
			}
			onDelete={setPendingDelete}
		/>
	);

	const sectionRow = (label: string, alert = false) => (
		<TableRow className="border-border/50 hover:bg-transparent">
			<TableCell
				colSpan={columnCount}
				className={cn(
					"h-8 bg-accent/20 pl-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70",
					alert && "text-red-600/80 dark:text-red-400/80",
				)}
			>
				{label}
			</TableCell>
		</TableRow>
	);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Window-drag leaf standing in for the hidden TopBar. */}
			<div className="drag h-10 shrink-0" />

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 pb-12">
					<div className="flex items-center justify-between">
						<h1 className="text-xl font-semibold tracking-tight">
							<Trans>Automations</Trans>
						</h1>
						<div className="flex items-center gap-2">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										asChild
										variant="ghost"
										size="icon-sm"
										className="size-8 text-muted-foreground"
									>
										<a
											href={`${COMPANY.DOCS_URL}/automations`}
											target="_blank"
											rel="noreferrer"
											aria-label={t({
												message: "Automations docs",
											})}
										>
											<LuCircleHelp className="size-4" />
										</a>
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<Trans>Automations docs</Trans>
								</TooltipContent>
							</Tooltip>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-8 gap-1.5 px-3"
								disabled={creatingWithAgent}
								onClick={handleCreateWithAgent}
							>
								<LuSparkles className="size-4" />
								<span>
									<Trans>Create with AI</Trans>
								</span>
							</Button>
							<Button
								type="button"
								size="sm"
								className="h-8 gap-1.5 px-3"
								disabled={createMutation.isPending}
								onClick={() => createMutation.mutate(null)}
							>
								<LuPlus className="size-4" />
								<span>
									<Trans>New automation</Trans>
								</span>
							</Button>
						</div>
					</div>

					{/* Zero-count stats and search are noise while a tab is empty;
					    with nothing in the org at all the tabs go too. */}
					{!tabEmpty && (
						<div className="mt-5">
							{showAutomationLoading ? (
								<div className="grid grid-cols-3 gap-2">
									{["a", "b", "c"].map((key) => (
										<Skeleton key={key} className="h-[70px] w-full" />
									))}
								</div>
							) : (
								<AutomationStatCards
									active={runStats.active}
									created7d={runStats.created7d}
									failed7d={runStats.failed7d}
									failedFilter={failedOnly}
									canFilterFailed={failedInTab.length > 0}
									onToggleFailedFilter={() => setFailedOnly((v) => !v)}
								/>
							)}
						</div>
					)}

					{!orgEmpty && (
						<div className="mt-6 flex items-center justify-between gap-2">
							<Tabs value={scope} onValueChange={handleScopeChange}>
								<TabsList className="h-8 bg-transparent p-0 gap-1">
									<TabsTrigger
										value="mine"
										className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
									>
										<span className="text-sm">
											<Trans>Mine</Trans>
										</span>
										<span className="ml-1 tabular-nums text-xs text-muted-foreground">
											{mineCount}
										</span>
									</TabsTrigger>
									<TabsTrigger
										value="team"
										className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
									>
										<span className="text-sm">
											<Trans>Team</Trans>
										</span>
										<span className="ml-1 tabular-nums text-xs text-muted-foreground">
											{teamCount}
										</span>
									</TabsTrigger>
								</TabsList>
							</Tabs>
							{!tabEmpty && (
								<div className="flex items-center gap-2">
									{scope === "mine" && failedMine.length > 0 && (
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="h-8 gap-1.5 px-3"
													disabled={retryAllMutation.isPending}
													onClick={() => retryAllMutation.mutate(failedMine)}
												>
													<LuRotateCw
														className={cn(
															"size-4",
															retryAllMutation.isPending && "animate-spin",
														)}
													/>
													<span>
														<Trans>Retry all</Trans>
													</span>
													<span className="tabular-nums text-xs text-muted-foreground">
														{failedMine.length}
													</span>
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												<Trans>
													Retry every automation whose last run failed
												</Trans>
											</TooltipContent>
										</Tooltip>
									)}
									<div className="relative">
										<LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
										<Input
											value={search}
											onChange={(e) => setSearch(e.target.value)}
											placeholder={t({
												message: "Search",
											})}
											aria-label={t({
												message: "Search automations",
											})}
											className="h-8 w-44 pl-8"
										/>
									</div>
								</div>
							)}
						</div>
					)}

					<div className={cn("mt-3", tabEmpty && "flex flex-1 flex-col")}>
						{showAutomationLoading ? (
							<div className="space-y-2">
								{["a", "b", "c", "d", "e", "f"].map((key) => (
									<Skeleton key={key} className="h-10 w-full" />
								))}
							</div>
						) : showAutomationError ? (
							<Empty className="rounded-xl border border-border py-16">
								<EmptyHeader>
									<EmptyMedia
										variant="icon"
										className="size-14 [&_svg:not([class*='size-'])]:size-7"
									>
										<LuTriangleAlert />
									</EmptyMedia>
									<EmptyTitle>
										<Trans>Couldn't load automations</Trans>
									</EmptyTitle>
									<EmptyDescription className="select-text cursor-text">
										{automationsError instanceof Error ? (
											automationsError.message
										) : (
											<Trans>The request failed.</Trans>
										)}
									</EmptyDescription>
								</EmptyHeader>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										void refetchAutomations();
									}}
								>
									<LuRotateCw className="size-4" />
									<span>
										<Trans>Try again</Trans>
									</span>
								</Button>
							</Empty>
						) : showMineEmptyState ? (
							<div className="flex flex-1 flex-col py-6">
								<AutomationsEmptyState
									onSelectTemplate={handleSelectTemplate}
									onCreateWithAgent={handleCreateWithAgent}
								/>
							</div>
						) : showTeamEmptyState ? (
							<Empty className="rounded-xl border border-border py-16">
								<EmptyHeader>
									<EmptyMedia
										variant="icon"
										className="size-14 [&_svg:not([class*='size-'])]:size-7"
									>
										<LuSearchX />
									</EmptyMedia>
									<EmptyTitle>
										<Trans>No team automations</Trans>
									</EmptyTitle>
									<EmptyDescription>
										<Trans>
											Nobody on your team has shared automations yet.
										</Trans>
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							// No overflow-hidden: it would break the sticky header, which
							// sticks relative to the page scroll container.
							<div className="rounded-xl border border-border">
								<Table className="table-fixed">
									{/* Radius + bg live on the corner cells: Chromium ignores
									    border-radius on table-header-groups, so a thead bg pokes
									    square past the container's rounded corners. */}
									<TableHeader className="sticky top-0 z-10 shadow-[inset_0_-1px_0_0_var(--color-border)] [&_th]:bg-background [&_tr>th:first-child]:rounded-tl-xl [&_tr>th:last-child]:rounded-tr-xl [&_tr]:border-b-0">
										<TableRow className="hover:bg-transparent">
											<TableHead className={cn(DATA_TABLE_HEAD_CELL, "pl-4")}>
												<SortableHeader
													field="name"
													label={t({
														message: "Name",
													})}
													sortField={sortField}
													sortDirection={sortDirection}
													onSort={handleSort}
												/>
											</TableHead>
											{scope === "team" && (
												<TableHead
													className={cn(DATA_TABLE_HEAD_CELL, "w-[14%]")}
												>
													<SortableHeader
														field="owner"
														label={t({
															message: "Owner",
														})}
														sortField={sortField}
														sortDirection={sortDirection}
														onSort={handleSort}
													/>
												</TableHead>
											)}
											<TableHead
												className={cn(DATA_TABLE_HEAD_CELL, scheduleWidth)}
											>
												<SortableHeader
													field="schedule"
													label={t({
														message: "Schedule",
													})}
													sortField={sortField}
													sortDirection={sortDirection}
													onSort={handleSort}
												/>
											</TableHead>
											<TableHead
												className={cn(DATA_TABLE_HEAD_CELL, statusWidth)}
											>
												<SortableHeader
													field="status"
													label={t({
														message: "Status",
													})}
													sortField={sortField}
													sortDirection={sortDirection}
													onSort={handleSort}
												/>
											</TableHead>
											<TableHead
												className={cn(DATA_TABLE_HEAD_CELL, lastRunWidth)}
											>
												{/* Sortable heads are buttons, which Chrome's UA sheet
												    exempts from the header's `uppercase` — match them. */}
												<span className="normal-case">
													<Trans>Last run</Trans>
												</span>
											</TableHead>
											<TableHead
												className={cn(DATA_TABLE_HEAD_CELL, "w-20 pr-4")}
											/>
										</TableRow>
									</TableHeader>
									<TableBody>
										{visible.length === 0 ? (
											<TableRow className="hover:bg-transparent">
												<TableCell
													colSpan={columnCount}
													className="h-24 text-center text-sm text-muted-foreground"
												>
													<Trans>No automations match</Trans>
												</TableCell>
											</TableRow>
										) : sortField ? (
											sortedVisible.map(renderAutomationRow)
										) : (
											<>
												{needsAttention.length > 0 &&
													sectionRow(
														t({
															message: "Needs attention",
														}),
														true,
													)}
												{needsAttention.map(renderAutomationRow)}
												{upNext.length > 0 &&
													sectionRow(
														t({
															message: "Up next",
														}),
													)}
												{upNext.map(renderAutomationRow)}
												{pausedVisible.length > 0 &&
													sectionRow(
														t({
															message: "Paused",
														}),
													)}
												{pausedVisible.map(renderAutomationRow)}
											</>
										)}
									</TableBody>
								</Table>
							</div>
						)}
					</div>

					{!cliHintDismissed && !showAutomationLoading && !tabEmpty && (
						<div className="relative mt-4 flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 pr-9">
							<LuTerminal className="size-3.5 shrink-0 text-muted-foreground" />
							<p className="min-w-0 truncate text-xs text-muted-foreground">
								<Trans>
									Tell any agent to use the{" "}
									<code className="select-text cursor-text rounded bg-accent/60 px-1 py-0.5 font-mono text-[11px] text-foreground">
										superset
									</code>{" "}
									CLI to spin up workspaces, run tasks, or manage automations.
								</Trans>{" "}
								<a
									href={`${COMPANY.DOCS_URL}/cli/getting-started`}
									target="_blank"
									rel="noreferrer"
									className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
								>
									<Trans>CLI docs</Trans>
								</a>
							</p>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								onClick={() => setCliHintDismissed(true)}
								aria-label={t({
									message: "Dismiss",
								})}
								className="absolute right-1.5 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								<LuX className="size-3.5" />
							</Button>
						</div>
					)}
				</div>
			</div>

			<HostOfflineRunDialog
				hostId={hostOfflineRun?.hostId ?? null}
				open={!!hostOfflineRun}
				onOpenChange={(next) => {
					if (!next) setHostOfflineRun(null);
				}}
			/>

			<AlertDialog
				open={!!pendingDelete}
				onOpenChange={(next) => {
					if (!next) setPendingDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Delete automation?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDelete ? (
								<Trans>
									"{pendingDelete.name}" will stop firing and its run history
									will be removed. This can't be undone.
								</Trans>
							) : null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (pendingDelete) {
									deleteMutation.mutate({
										id: pendingDelete.id,
										name: pendingDelete.name,
									});
								}
							}}
						>
							<Trans>Delete</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
