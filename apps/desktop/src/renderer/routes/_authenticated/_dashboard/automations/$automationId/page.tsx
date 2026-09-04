import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import { useMemo, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { HostOfflineRunDialog } from "../components/HostOfflineRunDialog";
import { isHostOfflineError } from "../utils/hostOfflineError";
import { isStaleAgentError, STALE_AGENT_HELP } from "../utils/staleAgentError";
import { AutomationBody } from "./components/AutomationBody";
import { AutomationDetailHeader } from "./components/AutomationDetailHeader";
import { VersionHistorySheet } from "./components/VersionHistorySheet";

type AutomationDetailSearch = {
	history?: boolean;
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/$automationId/",
)({
	component: AutomationDetailPage,
	validateSearch: (
		search: Record<string, unknown>,
	): AutomationDetailSearch => ({
		history: search.history === true,
	}),
});

const RECENT_RUNS_LIMIT = 10;

function AutomationDetailPage() {
	const { t } = useLingui();
	const { automationId } = Route.useParams();
	const { history } = Route.useSearch();
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;
	const [historyOpen, setHistoryOpen] = useState(history ?? false);
	const [hostOfflineOpen, setHostOfflineOpen] = useState(false);

	// The prompt body rides its own procedure — `get` omits it.
	const automationQuery = cloudTrpc.automation.get.useQuery(
		{ id: automationId },
		{ refetchInterval: 15_000, staleTime: 30_000 },
	);
	const promptQuery = cloudTrpc.automation.getPrompt.useQuery(
		{ id: automationId },
		{ refetchInterval: 15_000, staleTime: 30_000 },
	);
	const automation = useMemo(() => {
		if (!automationQuery.data || !promptQuery.data) return undefined;
		return { ...automationQuery.data, prompt: promptQuery.data.prompt };
	}, [automationQuery.data, promptQuery.data]);

	const { data: recentRuns = [] } = cloudTrpc.automation.listRuns.useQuery(
		{ automationId, limit: RECENT_RUNS_LIMIT },
		{ refetchInterval: 5_000, staleTime: 30_000 },
	);

	const ownerUserId = automationQuery.data?.ownerUserId;
	const { data: memberRows = [] } = cloudTrpc.organization.listMembers.useQuery(
		undefined,
		{ staleTime: 30_000 },
	);
	const owner = memberRows.find(
		(member) => member.userId === ownerUserId,
	)?.user;
	const ownerName = owner?.name ?? owner?.email ?? null;

	const utils = cloudTrpc.useUtils();

	const setEnabledMutation = useMutation({
		mutationFn: (enabled: boolean) =>
			apiTrpcClient.automation.setEnabled.mutate({ id: automationId, enabled }),
		onSuccess: () => {
			void utils.automation.get.invalidate({ id: automationId });
			void utils.automation.list.invalidate();
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

	const runNowMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.runNow.mutate({ id: automationId }),
		onSuccess: () =>
			toast.success(
				t({
					message: "Running now",
				}),
			),
		onError: (error) => {
			const message = error instanceof Error ? error.message : null;
			if (isHostOfflineError(message)) {
				setHostOfflineOpen(true);
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

	const deleteMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.delete.mutate({ id: automationId }),
		onSuccess: () => {
			void utils.automation.list.invalidate();
			navigate({ to: "/automations" });
		},
	});

	if (!automation) {
		if (automationQuery.isPending || promptQuery.isPending) return null;
		// A deleted automation is a NOT_FOUND from the server; anything else is a
		// failed read and must not be reported as a missing automation.
		const loadError = automationQuery.error ?? promptQuery.error;
		const isMissing =
			loadError instanceof TRPCClientError &&
			loadError.data?.code === "NOT_FOUND";
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground select-text cursor-text">
				{loadError && !isMissing ? (
					<Trans>Couldn't load automation: {loadError.message}</Trans>
				) : (
					<Trans>Automation not found.</Trans>
				)}
			</div>
		);
	}

	// Every automation mutation is owner-gated server-side; render teammates'
	// automations read-only instead of letting edits silently bounce. Unknown
	// session (still loading) stays editable — the server is the enforcement.
	const readOnly =
		currentUserId !== undefined && automation.ownerUserId !== currentUserId;

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			<div className="flex flex-1 flex-col overflow-hidden">
				<AutomationDetailHeader
					name={automation.name}
					onDelete={() => {
						alert({
							title: t({
								message: "Delete automation?",
							}),
							description: t({
								message: `"${automation.name}" will stop firing and its run history will be removed. This can't be undone.`,
							}),
							actions: [
								{
									label: t({
										message: "Cancel",
									}),
									variant: "outline",
									onClick: () => {},
								},
								{
									label: t({
										message: "Delete",
									}),
									variant: "destructive",
									onClick: () => {
										toast.promise(deleteMutation.mutateAsync(), {
											loading: t({
												message: "Deleting automation...",
											}),
											success: t({
												message: `"${automation.name}" deleted`,
											}),
											error: (err) =>
												err instanceof Error
													? err.message
													: t({
															message: "Failed to delete automation",
														}),
										});
									},
								},
							],
						});
					}}
					onRunNow={() => runNowMutation.mutate()}
					onOpenHistory={() => setHistoryOpen(true)}
					deleteDisabled={deleteMutation.isPending}
					runNowDisabled={runNowMutation.isPending}
					readOnly={readOnly}
				/>

				<AutomationBody
					key={automation.id}
					automation={automation}
					recentRuns={recentRuns}
					ownerName={ownerName}
					onToggleEnabled={(enabled) => setEnabledMutation.mutate(enabled)}
					toggleDisabled={setEnabledMutation.isPending}
					readOnly={readOnly}
				/>
			</div>

			<HostOfflineRunDialog
				hostId={automation.targetHostId}
				open={hostOfflineOpen}
				onOpenChange={setHostOfflineOpen}
			/>

			<VersionHistorySheet
				key={automation.id}
				automationId={automation.id}
				automationName={automation.name}
				currentPrompt={automation.prompt}
				// Versions are owner-gated server-side too; the header action is
				// hidden, but the ?history=true search param could still open it.
				open={!readOnly && historyOpen}
				onOpenChange={setHistoryOpen}
			/>
		</div>
	);
}
