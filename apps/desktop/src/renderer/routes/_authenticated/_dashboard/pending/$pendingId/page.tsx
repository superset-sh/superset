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
import { useAdoptWorktree } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useAdoptWorktree";
import { useCheckoutDashboardWorkspace } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useCheckoutDashboardWorkspace";
import { useCreateDashboardWorkspace } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useCreateDashboardWorkspace";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { PendingWorkspaceRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	buildAdoptPayload,
	buildCheckoutPayload,
	buildForkPayload,
} from "./buildIntentPayload";
import { buildSetupPaneLayout } from "./buildSetupPaneLayout";

/**
 * Pending workspace progress page.
 *
 * Lives at /_dashboard/pending/$pendingId (NOT under /v2-workspace/) because
 * the v2-workspace layout wraps children in WorkspaceTrpcProvider. During route
 * transitions away from a real workspace, the layout would strip the provider
 * while the old workspace's TerminalPane is still mounted — causing a crash.
 * Keeping this route outside v2-workspace avoids that entirely.
 *
 * The page is the single point of dispatch for all three workspace-creation
 * intents (fork / checkout / adopt). The modal inserts a row tagged with
 * `intent` and navigates here; this page calls the right host-service mutation
 * on first mount and on retry. See `V2_WORKSPACE_CREATION.md` §3.
 */
export const Route = createFileRoute(
	"/_authenticated/_dashboard/pending/$pendingId/",
)({
	component: PendingWorkspacePage,
});

function useFireIntent(pendingId: string, pending: PendingWorkspaceRow | null) {
	const collections = useCollections();
	const createWorkspace = useCreateDashboardWorkspace();
	const checkoutWorkspace = useCheckoutDashboardWorkspace();
	const adoptWorktree = useAdoptWorktree();

	return useCallback(async () => {
		if (!pending) return;

		collections.pendingWorkspaces.update(pendingId, (draft) => {
			draft.status = "creating";
			draft.error = null;
		});

		try {
			let result: {
				workspace?: { id?: string } | null;
				terminals?: Array<{ id: string; role: string; label: string }>;
				warnings?: string[];
			};

			switch (pending.intent) {
				case "fork": {
					let attachments:
						| Array<{ data: string; mediaType: string; filename: string }>
						| undefined;
					if (pending.attachmentCount > 0) {
						try {
							attachments = await loadAttachments(pendingId);
						} catch {
							// proceed without
						}
					}
					result = await createWorkspace(
						buildForkPayload(pendingId, pending, attachments),
					);
					break;
				}
				case "checkout": {
					result = await checkoutWorkspace(
						buildCheckoutPayload(pendingId, pending),
					);
					break;
				}
				case "adopt": {
					result = await adoptWorktree(buildAdoptPayload(pending));
					break;
				}
			}

			collections.pendingWorkspaces.update(pendingId, (draft) => {
				draft.status = "succeeded";
				draft.workspaceId = result.workspace?.id ?? null;
				draft.terminals = result.terminals ?? [];
				draft.warnings = result.warnings ?? [];
			});
			void clearAttachments(pendingId);
		} catch (err) {
			collections.pendingWorkspaces.update(pendingId, (draft) => {
				draft.status = "failed";
				draft.error =
					err instanceof Error ? err.message : "Failed to create workspace";
			});
		}
	}, [
		collections,
		createWorkspace,
		checkoutWorkspace,
		adoptWorktree,
		pending,
		pendingId,
	]);
}

function PendingWorkspacePage() {
	const { pendingId } = Route.useParams();
	const navigate = useNavigate();
	const collections = useCollections();
	const { activeHostUrl } = useLocalHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const navigatedRef = useRef(false);
	const firedRef = useRef(false);

	// Route params can change under a mounted component (user navigates from
	// one pending page to another). Reset the fire/nav guards so the new
	// pendingId actually dispatches — otherwise the second page sticks in
	// "creating" forever.
	const prevPendingIdRef = useRef(pendingId);
	if (prevPendingIdRef.current !== pendingId) {
		prevPendingIdRef.current = pendingId;
		firedRef.current = false;
		navigatedRef.current = false;
	}

	const { data: pendingRows } = useLiveQuery(
		(q) =>
			q
				.from({ pw: collections.pendingWorkspaces })
				.where(({ pw }) => eq(pw.id, pendingId))
				.select(({ pw }) => ({ ...pw })),
		[collections, pendingId],
	);
	const pending = pendingRows?.[0] ?? null;
	const fireIntent = useFireIntent(pendingId, pending);

	// Wait for the cloud row to appear in the local collection before
	// navigating. Fast-path intents (adopt) can beat Electric sync to the
	// punch, landing us on the workspace route before the row is visible —
	// which shows "workspace not found". Fork's slow path hides this race.
	const { data: workspaceRowMatch } = useLiveQuery(
		(q) =>
			q
				.from({ w: collections.v2Workspaces })
				.where(({ w }) => eq(w.id, pending?.workspaceId ?? ""))
				.select(({ w }) => ({ id: w.id })),
		[collections, pending?.workspaceId],
	);
	const workspaceSynced = (workspaceRowMatch?.length ?? 0) > 0;

	// Fire the mutation once on first mount. The modal stores draft state in
	// the pending row and navigates here — page owns the actual call so all
	// three intents share one dispatch + retry path.
	useEffect(() => {
		if (!pending || pending.status !== "creating" || firedRef.current) return;
		firedRef.current = true;
		void fireIntent();
	}, [pending, fireIntent]);

	// Poll host-service for step-by-step progress (fork + checkout only;
	// adopt is fast and doesn't instrument progress).
	const intentHasProgress =
		pending?.intent === "fork" || pending?.intent === "checkout";
	const hostUrl = !pending
		? activeHostUrl
		: pending.hostTarget.kind === "local"
			? activeHostUrl
			: `${env.RELAY_URL}/hosts/${pending.hostTarget.hostId}`;

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
		enabled: pending?.status === "creating" && !!hostUrl && intentHasProgress,
	});

	const steps = progress?.steps ?? [];

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

	// Fallback: if the collection never syncs (offline, slow Electric),
	// navigate anyway after a bounded wait. Target page will show its own
	// loading state.
	const [syncTimedOut, setSyncTimedOut] = useState(false);
	useEffect(() => {
		if (
			pending?.status !== "succeeded" ||
			!pending.workspaceId ||
			workspaceSynced ||
			navigatedRef.current
		) {
			return;
		}
		const timer = setTimeout(() => setSyncTimedOut(true), 3000);
		return () => clearTimeout(timer);
	}, [pending?.status, pending?.workspaceId, workspaceSynced]);

	useEffect(() => {
		if (
			pending?.status === "succeeded" &&
			pending.workspaceId &&
			(workspaceSynced || syncTimedOut) &&
			!navigatedRef.current
		) {
			navigatedRef.current = true;
			ensureWorkspaceInSidebar(pending.workspaceId, pending.projectId);

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
	}, [
		collections,
		ensureWorkspaceInSidebar,
		navigate,
		pending,
		pendingId,
		workspaceSynced,
		syncTimedOut,
	]);

	if (!pending) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Workspace not found
			</div>
		);
	}

	const creatingLabel =
		pending.intent === "adopt"
			? "Adopting worktree..."
			: pending.intent === "checkout"
				? "Checking out branch..."
				: "Creating workspace...";

	return (
		<div className="flex h-full w-full flex-1 justify-center pt-24">
			<div className="w-full max-w-sm space-y-5 p-8">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">{pending.name}</h2>
					<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<GoGitBranch className="size-3.5" />
						<span className="font-mono">{pending.branchName}</span>
					</div>
				</div>

				{pending.status === "creating" && (
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<p
								className={`text-sm ${isStale ? "text-amber-500" : "text-muted-foreground"}`}
							>
								{isStale
									? "This is taking longer than expected..."
									: creatingLabel}
							</p>
							<span className="text-xs tabular-nums text-muted-foreground/50">
								{elapsedLabel}
							</span>
						</div>
						{intentHasProgress && steps.length > 0 ? (
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
						) : (
							// Adopt has no host-side progress steps — show a generic spinner.
							<div className="flex items-center gap-2.5 text-sm text-muted-foreground">
								<div className="size-4 flex items-center justify-center">
									<div className="size-2.5 rounded-full bg-foreground animate-pulse" />
								</div>
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
					<div className="space-y-2">
						<div className="flex items-center gap-2 text-sm text-emerald-500">
							<HiCheck className="size-4" />
							<span>Workspace ready — opening...</span>
						</div>
						{pending.warnings.length > 0 && (
							<ul className="space-y-1 text-xs text-amber-500">
								{pending.warnings.map((w) => (
									<li key={w} className="flex items-start gap-1.5">
										<HiExclamationTriangle className="size-3.5 mt-0.5 shrink-0" />
										<span>{w}</span>
									</li>
								))}
							</ul>
						)}
					</div>
				)}

				{pending.status === "failed" && (
					<div className="space-y-4">
						<div className="flex items-start gap-2 text-sm text-destructive">
							<HiExclamationTriangle className="size-4 mt-0.5 shrink-0" />
							<span className="select-text cursor-text break-words">
								{pending.error ?? "Failed to create workspace"}
							</span>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
								onClick={() => {
									firedRef.current = true; // prevent the mount-effect from racing
									void fireIntent();
								}}
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
