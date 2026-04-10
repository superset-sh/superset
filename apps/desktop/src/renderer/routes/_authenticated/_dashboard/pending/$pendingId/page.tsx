import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiCheck, HiExclamationTriangle } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	clearAttachments,
	loadAttachments,
} from "renderer/lib/pending-attachment-store";
import { useCreateDashboardWorkspace } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useCreateDashboardWorkspace";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

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
				draft.initialCommands = result.initialCommands ?? null;
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

function PendingWorkspacePage() {
	const { pendingId } = Route.useParams();
	const navigate = useNavigate();
	const collections = useCollections();
	const { activeHostUrl } = useLocalHostService();
	const navigatedRef = useRef(false);

	// Read pending workspace from collection (declared early for useRetryCreate)
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

	// Poll host-service for step-by-step progress
	const hostUrl =
		pending?.hostTarget &&
		typeof pending.hostTarget === "object" &&
		"kind" in (pending.hostTarget as Record<string, unknown>)
			? (pending.hostTarget as { kind: string; hostId?: string }).kind ===
				"local"
				? activeHostUrl
				: `${env.RELAY_URL}/hosts/${(pending.hostTarget as { hostId: string }).hostId}`
			: activeHostUrl;

	const { data: progress } = useQuery({
		queryKey: ["workspaceCreation", "getProgress", pendingId, hostUrl],
		queryFn: async () => {
			if (!hostUrl) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.getProgress.query({
				pendingId,
			});
		},
		refetchInterval: 500,
		enabled: pending?.status === "creating" && !!hostUrl,
	});

	const steps = progress?.steps ?? [];

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
	const elapsedLabel = formatRelativeTime(createdAtMs);
	const isStale =
		pending?.status === "creating" && elapsedMs > STALE_THRESHOLD_MS;

	// Auto-navigate to real workspace on success
	useEffect(() => {
		if (
			pending?.status === "succeeded" &&
			pending.workspaceId &&
			!navigatedRef.current
		) {
			navigatedRef.current = true;
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: pending.workspaceId },
			});
			// Clean up the pending row after a short delay
			setTimeout(() => {
				collections.pendingWorkspaces.delete(pendingId);
			}, 1000);
		}
	}, [collections, navigate, pending, pendingId]);

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
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<p
								className={`text-sm ${isStale ? "text-amber-500" : "text-muted-foreground"}`}
							>
								{isStale
									? "This is taking longer than expected..."
									: "Creating workspace..."}
							</p>
							<span className="text-xs tabular-nums text-muted-foreground/50">
								{elapsedLabel}
							</span>
						</div>
						{steps.length > 0 && (
							<div className="space-y-2">
								{steps.map((step) => (
									<div
										key={step.id}
										className="flex items-center gap-2.5 text-sm"
									>
										{step.status === "done" ? (
											<HiCheck className="size-4 text-emerald-500" />
										) : step.status === "active" ? (
											<div className="size-4 flex items-center justify-center">
												<div className="size-2.5 rounded-full bg-foreground animate-pulse" />
											</div>
										) : (
											<div className="size-4 flex items-center justify-center">
												<div className="size-2 rounded-full bg-muted-foreground/30" />
											</div>
										)}
										<span
											className={
												step.status === "done" || step.status === "active"
													? "text-foreground"
													: "text-muted-foreground/50"
											}
										>
											{step.label}
										</span>
									</div>
								))}
							</div>
						)}
						<div className="flex gap-2 pt-1">
							<button
								type="button"
								className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
								onClick={() => {
									collections.pendingWorkspaces.delete(pendingId);
									void clearAttachments(pendingId);
									void navigate({ to: "/" });
								}}
							>
								Dismiss
							</button>
						</div>
					</div>
				)}

				{pending.status === "succeeded" && (
					<div className="flex items-center gap-2 text-sm text-emerald-500">
						<HiCheck className="size-4" />
						<span>Workspace created — opening...</span>
					</div>
				)}

				{pending.status === "failed" && (
					<div className="space-y-4">
						<div className="flex items-start gap-2 text-sm text-destructive">
							<HiExclamationTriangle className="size-4 mt-0.5 shrink-0" />
							<span>{pending.error ?? "Failed to create workspace"}</span>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
								onClick={() => void retryCreate()}
							>
								Retry
							</button>
							<button
								type="button"
								className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
								onClick={() => {
									collections.pendingWorkspaces.delete(pendingId);
									void clearAttachments(pendingId);
									void navigate({ to: "/" });
								}}
							>
								Dismiss
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
