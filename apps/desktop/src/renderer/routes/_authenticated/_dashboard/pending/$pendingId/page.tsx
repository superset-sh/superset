import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiCheck } from "react-icons/hi2";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	clearAttachments,
	loadAttachments,
} from "renderer/lib/pending-attachment-store";
import { resolveHostUrl } from "renderer/lib/resolveHostUrl";
import { useCreateDashboardWorkspace } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useCreateDashboardWorkspace";
import { ProjectSetupStep } from "renderer/routes/_authenticated/components/ProjectSetupStep";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useV2ProjectList } from "renderer/routes/_authenticated/hooks/useV2ProjectList";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { buildSetupPaneLayout } from "./buildSetupPaneLayout";
import { PendingCreatingStatus } from "./components/PendingCreatingStatus";
import { PendingFailedStatus } from "./components/PendingFailedStatus";

/**
 * Pending workspace progress page.
 *
 * Lives at /_dashboard/pending/$pendingId (NOT under /v2-workspace/) because
 * the v2-workspace layout wraps children in WorkspaceTrpcProvider. During route
 * transitions away from a real workspace, the layout would strip the provider
 * while the old workspace's TerminalPane is still mounted — causing a crash.
 * Keeping this route outside v2-workspace avoids that entirely.
 */
export const Route = createFileRoute(
	"/_authenticated/_dashboard/pending/$pendingId/",
)({
	component: PendingWorkspacePage,
});

// ── Helpers ──────────────────────────────────────────────────────────

const SETUP_ERROR_CODES = ["PROJECT_NOT_SETUP", "PROJECT_PATH_MISSING"];

function isSetupError(error: string | null): boolean {
	if (!error) return false;
	return SETUP_ERROR_CODES.some((code) => error.includes(code));
}

// ── Hooks ────────────────────────────────────────────────────────────

function useRetryCreate(
	pendingId: string,
	pending: {
		projectId: string;
		name: string;
		branchName: string;
		prompt: string;
		baseBranch: string | null;
		runSetupScript: boolean;
		linkedIssues: unknown[];
		linkedPR: unknown;
		hostTarget: unknown;
		attachmentCount: number;
	} | null,
) {
	const collections = useCollections();
	const createWorkspace = useCreateDashboardWorkspace();

	return useCallback(async () => {
		if (!pending) return;

		collections.pendingWorkspaces.update(pendingId, (draft) => {
			draft.status = "creating";
			draft.error = null;
		});

		const internalIssueIds = (
			pending.linkedIssues as Array<{ source?: string; taskId?: string }>
		)
			.filter((i) => i.source === "internal" && i.taskId)
			.map((i) => i.taskId as string);
		const githubIssueUrls = (
			pending.linkedIssues as Array<{ source?: string; url?: string }>
		)
			.filter((i) => i.source === "github" && i.url)
			.map((i) => i.url as string);
		const linkedPR = pending.linkedPR as { url?: string } | null;

		let attachmentPayload:
			| Array<{ data: string; mediaType: string; filename: string }>
			| undefined;
		if (pending.attachmentCount > 0) {
			try {
				attachmentPayload = await loadAttachments(pendingId);
			} catch {
				// proceed without
			}
		}

		try {
			const result = await createWorkspace({
				pendingId,
				projectId: pending.projectId,
				hostTarget: pending.hostTarget as
					| { kind: "local" }
					| { kind: "host"; hostId: string },
				names: {
					workspaceName: pending.name,
					branchName: pending.branchName,
				},
				composer: {
					prompt: pending.prompt || undefined,
					baseBranch: pending.baseBranch || undefined,
					runSetupScript: pending.runSetupScript,
				},
				linkedContext: {
					internalIssueIds:
						internalIssueIds.length > 0 ? internalIssueIds : undefined,
					githubIssueUrls:
						githubIssueUrls.length > 0 ? githubIssueUrls : undefined,
					linkedPrUrl: linkedPR?.url,
					attachments: attachmentPayload,
				},
			});

			collections.pendingWorkspaces.update(pendingId, (draft) => {
				draft.status = "succeeded";
				draft.workspaceId = result.workspace?.id ?? null;
				draft.terminals = result.terminals ?? [];
			});
			void clearAttachments(pendingId);
		} catch (err) {
			collections.pendingWorkspaces.update(pendingId, (draft) => {
				draft.status = "failed";
				draft.error =
					err instanceof Error ? err.message : "Failed to create workspace";
			});
		}
	}, [collections, createWorkspace, pending, pendingId]);
}

// ── Component ────────────────────────────────────────────────────────

function PendingWorkspacePage() {
	const { pendingId } = Route.useParams();
	const navigate = useNavigate();
	const collections = useCollections();
	const { activeHostUrl } = useLocalHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const navigatedRef = useRef(false);

	const { data: pendingRows } = useLiveQuery(
		(q) =>
			q
				.from({ pw: collections.pendingWorkspaces })
				.where(({ pw }) => eq(pw.id, pendingId))
				.select(({ pw }) => ({ ...pw })),
		[collections, pendingId],
	);
	const pending = pendingRows?.[0] ?? null;
	const retryCreate = useRetryCreate(pendingId, pending);

	const v2Projects = useV2ProjectList();
	const projectName = pending?.projectId
		? (v2Projects?.find((p) => p.id === pending.projectId)?.name ?? null)
		: null;

	const hostUrl = resolveHostUrl(pending?.hostTarget, activeHostUrl);
	const needsSetup =
		pending?.status === "failed" && isSetupError(pending.error);

	// Poll host-service for step-by-step progress
	const { data: progress } = useQuery({
		queryKey: ["workspaceCreation", "getProgress", pendingId, hostUrl],
		queryFn: async () => {
			if (!hostUrl) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.getProgress.query({ pendingId });
		},
		refetchInterval: 500,
		enabled: pending?.status === "creating" && !!hostUrl,
	});

	// Elapsed timer + staleness detection
	const STALE_THRESHOLD_MS = 2 * 60 * 1000;
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (pending?.status !== "creating") return;
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, [pending?.status]);

	const createdAtMs = pending?.createdAt
		? new Date(pending.createdAt).getTime()
		: now;
	const elapsedMs = Math.max(0, now - createdAtMs);

	// Auto-navigate to real workspace on success
	useEffect(() => {
		if (
			pending?.status === "succeeded" &&
			pending.workspaceId &&
			!navigatedRef.current
		) {
			navigatedRef.current = true;

			// Ensure sidebar local state row exists before writing pane layout
			ensureWorkspaceInSidebar(pending.workspaceId, pending.projectId);

			// Pre-populate pane layout with setup terminals (already running on host)
			if (pending.terminals.length > 0) {
				const paneLayout = buildSetupPaneLayout(pending.terminals);
				collections.v2WorkspaceLocalState.update(
					pending.workspaceId,
					(draft) => {
						draft.paneLayout = paneLayout;
					},
				);
			}

			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: pending.workspaceId },
			});
			setTimeout(() => {
				collections.pendingWorkspaces.delete(pendingId);
			}, 1000);
		}
	}, [collections, ensureWorkspaceInSidebar, navigate, pending, pendingId]);

	const dismiss = useCallback(() => {
		collections.pendingWorkspaces.delete(pendingId);
		void clearAttachments(pendingId);
		void navigate({ to: "/" });
	}, [collections, navigate, pendingId]);

	if (!pending) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Workspace not found
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-1 justify-center pt-24">
			<div className="w-full max-w-sm space-y-5 p-8">
				{/* Header */}
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">{pending.name}</h2>
					<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<GoGitBranch className="size-3.5" />
						<span className="font-mono">{pending.branchName}</span>
					</div>
				</div>

				{/* Status */}
				{pending.status === "creating" && (
					<PendingCreatingStatus
						steps={progress?.steps ?? []}
						elapsedLabel={formatRelativeTime(createdAtMs)}
						isStale={elapsedMs > STALE_THRESHOLD_MS}
						onDismiss={dismiss}
					/>
				)}

				{pending.status === "succeeded" && (
					<div className="flex items-center gap-2 text-sm text-emerald-500">
						<HiCheck className="size-4" />
						<span>Workspace created — opening...</span>
					</div>
				)}

				{pending.status === "failed" && needsSetup && hostUrl && (
					<ProjectSetupStep
						projectId={pending.projectId}
						projectName={projectName ?? pending.name}
						hostUrl={hostUrl}
						onSetupComplete={() => void retryCreate()}
					/>
				)}

				{pending.status === "failed" && !needsSetup && (
					<PendingFailedStatus
						error={pending.error}
						onRetry={() => void retryCreate()}
						onDismiss={dismiss}
					/>
				)}
			</div>
		</div>
	);
}
