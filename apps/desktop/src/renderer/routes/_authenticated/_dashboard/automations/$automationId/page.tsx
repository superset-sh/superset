import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
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
	const { automationId } = Route.useParams();
	const { history } = Route.useSearch();
	const navigate = useNavigate();
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;
	const [historyOpen, setHistoryOpen] = useState(history ?? false);
	const [hostOfflineOpen, setHostOfflineOpen] = useState(false);

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

	const ownerUserId = automation?.ownerUserId;
	const { data: ownerRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ u: collections.users })
				.where(({ u }) => eq(u.id, ownerUserId ?? ""))
				.select(({ u }) => ({ name: u.name, email: u.email })),
		[collections.users, ownerUserId],
	);
	const ownerName = ownerRows[0]?.name ?? ownerRows[0]?.email ?? null;

	const setEnabledMutation = useMutation({
		mutationFn: (enabled: boolean) =>
			apiTrpcClient.automation.setEnabled.mutate({ id: automationId, enabled }),
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to update automation",
			),
	});

	const runNowMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.runNow.mutate({ id: automationId }),
		onSuccess: () => toast.success("Running now"),
		onError: (error) => {
			const message = error instanceof Error ? error.message : null;
			if (isHostOfflineError(message)) {
				setHostOfflineOpen(true);
				return;
			}
			if (isStaleAgentError(message)) {
				toast.error(STALE_AGENT_HELP);
				return;
			}
			toast.error(message ?? "Failed to trigger run");
		},
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
