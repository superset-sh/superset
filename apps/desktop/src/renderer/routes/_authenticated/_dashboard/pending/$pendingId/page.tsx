import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiExclamationTriangle } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
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
import { KeypadLoader } from "renderer/screens/main/components/WorkspaceView/WorkspaceInitializingView/KeypadLoader";
import { StepProgress } from "renderer/screens/main/components/WorkspaceView/WorkspaceInitializingView/StepProgress";
import type { WorkspaceInitStep } from "shared/types/workspace-init";
import type { ResolvedPrContent } from "./buildForkAgentLaunch";
import {
	buildAdoptPayload,
	buildCheckoutPayload,
	buildForkPayload,
	buildPrCheckoutPayload,
} from "./buildIntentPayload";
import { buildSetupPaneLayout } from "./buildSetupPaneLayout";
import { dispatchForkLaunch } from "./dispatchForkLaunch";
import { mapProgressToInitStep } from "./mapProgressToInitStep";
import { useAnimatedInitStep } from "./useAnimatedInitStep";

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

const V2_PENDING_STEP_MESSAGES: Partial<Record<WorkspaceInitStep, string>> = {
	pending: "Preparing workspace",
	syncing: "Preparing workspace",
	verifying: "Checking repository",
	fetching: "Fetching latest changes",
	creating_worktree: "Creating worktree",
	copying_config: "Registering workspace",
	finalizing: "Opening workspace",
	ready: "Ready",
	failed: "Failed",
};

const V2_PENDING_KEYPAD_LABELS: Partial<Record<WorkspaceInitStep, string>> = {
	pending: "Preparing workspace",
	syncing: "Preparing workspace",
	verifying: "Checking repository",
	fetching: "Fetching latest changes",
	creating_worktree: "Creating worktree",
	copying_config: "Registering workspace",
	finalizing: "Opening workspace",
	ready: "Ready",
	failed: "Failed",
};

function useFireIntent(pendingId: string, pending: PendingWorkspaceRow | null) {
	const collections = useCollections();
	const createWorkspace = useCreateDashboardWorkspace();
	const checkoutWorkspace = useCheckoutDashboardWorkspace();
	const adoptWorktree = useAdoptWorktree();
	const trpcUtils = electronTrpc.useUtils();
	const { activeHostUrl } = useLocalHostService();

	const fire = useCallback(async () => {
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
			let loadedAttachments:
				| Array<{ data: string; mediaType: string; filename: string }>
				| undefined;
			// Populated in the pr-checkout path; threaded into dispatchForkLaunch
			// so the agent-launch resolver reuses the data instead of re-fetching.
			let resolvedPr: ResolvedPrContent | undefined;

			switch (pending.intent) {
				case "fork": {
					if (pending.attachmentCount > 0) {
						try {
							loadedAttachments = await loadAttachments(pendingId);
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err);
							console.warn("[v2-launch] loadAttachments failed:", err);
							toast.warning("Couldn't load saved attachments", {
								description: `Workspace will be created without files. ${msg}`,
							});
						}
					}
					result = await createWorkspace(
						buildForkPayload(pendingId, pending, loadedAttachments),
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
				case "pr-checkout": {
					if (!pending.linkedPR) {
						throw new Error("pr-checkout intent requires a linkedPR");
					}
					const hostUrl =
						pending.hostTarget.kind === "local"
							? activeHostUrl
							: `${env.RELAY_URL}/hosts/${pending.hostTarget.hostId}`;
					if (!hostUrl) {
						throw new Error("Host service not available");
					}
					const hostClient = getHostServiceClientByUrl(hostUrl);
					// Single fetch — reused by both the mutation payload and the
					// agent-launch resolver (via resolvedPr). Zero net new fetches
					// vs fork-with-PR, which fetches the same data at launch build.
					const prContent =
						await hostClient.workspaceCreation.getGitHubPullRequestContent.query(
							{
								projectId: pending.projectId,
								prNumber: pending.linkedPR.prNumber,
							},
						);
					resolvedPr = {
						number: prContent.number,
						url: prContent.url,
						title: prContent.title,
						body: prContent.body,
						branch: prContent.branch,
					};
					result = await checkoutWorkspace(
						buildPrCheckoutPayload(pendingId, pending, prContent),
					);
					break;
				}
			}

			// V2 dispatch: after host-service.create resolves, build the launch
			// plan and stash it on the pending row. The V2 workspace page's
			// useConsumePendingLaunch mount-effect picks it up and opens the
			// pane. See apps/desktop/docs/V2_LAUNCH_CONTEXT.md.
			//
			// Fetch agent configs imperatively here rather than reading from
			// a useQuery hook — a not-yet-resolved query would silently skip
			// the dispatch, permanently losing the launch for a successful
			// workspace create.
			const needsLaunchDispatch =
				(pending.intent === "fork" || pending.intent === "pr-checkout") &&
				!!result.workspace?.id;
			if (needsLaunchDispatch && result.workspace?.id) {
				const agentConfigs = await trpcUtils.settings.getAgentPresets.fetch();
				await dispatchForkLaunch({
					workspaceId: result.workspace.id,
					pending,
					loadedAttachments,
					agentConfigs,
					activeHostUrl,
					resolvedPr,
					onApplyToRow: (patch) => {
						collections.pendingWorkspaces.update(pendingId, (draft) => {
							if (patch.terminalLaunch !== undefined) {
								draft.terminalLaunch = patch.terminalLaunch;
							}
							if (patch.chatLaunch !== undefined) {
								draft.chatLaunch = patch.chatLaunch;
							}
						});
					},
				});
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
		trpcUtils,
		activeHostUrl,
	]);

	return fire;
}

function PendingWorkspacePage() {
	const { pendingId } = Route.useParams();
	const navigate = useNavigate();
	const collections = useCollections();
	const { activeHostUrl } = useLocalHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const navigatedRef = useRef(false);
	const firedRef = useRef(false);
	const warningsToastedRef = useRef<string | null>(null);

	// Route params can change under a mounted component (user navigates from
	// one pending page to another). Reset the fire/nav guards so the new
	// pendingId actually dispatches — otherwise the second page sticks in
	// "creating" forever.
	const prevPendingIdRef = useRef(pendingId);
	const [syncTimedOut, setSyncTimedOut] = useState(false);
	if (prevPendingIdRef.current !== pendingId) {
		prevPendingIdRef.current = pendingId;
		firedRef.current = false;
		navigatedRef.current = false;
		warningsToastedRef.current = null;
		setSyncTimedOut(false);
	}

	const { data: pendingRows } = useLiveQuery(
		(q) =>
			q
				.from({ pw: collections.pendingWorkspaces })
				.where(({ pw }) => eq(pw.id, pendingId))
				.select(({ pw }) => ({ ...pw })),
		[collections, pendingId],
	);
	const pending: PendingWorkspaceRow | null =
		(pendingRows?.[0] as PendingWorkspaceRow | undefined) ?? null;
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

	// Poll host-service for step-by-step progress (create + checkout flows;
	// adopt is fast and doesn't instrument progress).
	const intentHasProgress =
		pending?.intent === "fork" ||
		pending?.intent === "checkout" ||
		pending?.intent === "pr-checkout";
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
		// Poll tight enough to catch fast transitions between
		// host-service steps — `getProgress` is a single in-memory Map read.
		refetchInterval: 200,
		enabled: pending?.status === "creating" && !!hostUrl && intentHasProgress,
	});

	const steps = progress?.steps ?? [];
	const rawInitStep = mapProgressToInitStep(steps);
	// Force the walker toward "ready" once the mutation itself resolves —
	// the host-service's in-memory progress is cleared at the end, so
	// `rawInitStep` drops back to "pending" right as we'd otherwise want to
	// see the final keypad state. Pinning to "ready" lets the walker finish.
	const walkerTarget: WorkspaceInitStep =
		pending?.status === "succeeded"
			? "ready"
			: pending?.status === "failed"
				? "failed"
				: rawInitStep;
	const displayedInitStep = useAnimatedInitStep(walkerTarget, pendingId);

	// Honor the user's notification-mute preference + volume for the keypad
	// click sound. Default to muted while the query loads so we never play a
	// click for a user who has it disabled before the setting resolves.
	const { data: notificationSoundsMuted = true } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();
	const { data: notificationVolume = 100 } =
		electronTrpc.settings.getNotificationVolume.useQuery();

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

	useEffect(() => {
		if (
			pending?.status !== "succeeded" ||
			pending.warnings.length === 0 ||
			warningsToastedRef.current === pendingId
		) {
			return;
		}

		warningsToastedRef.current = pendingId;
		for (const warning of pending.warnings) {
			toast.warning(warning);
		}
	}, [pending?.status, pending?.warnings, pendingId]);

	// If sync stalls past this, swap the spinner for a recoverable stall UI
	// rather than silently navigating into "Workspace not found". syncTimedOut
	// must stay in the deps + guard below so "Keep waiting" (which flips it
	// false) re-arms a fresh timer instead of leaving the user stranded.
	const SYNC_TIMEOUT_MS = 10_000;
	useEffect(() => {
		if (
			pending?.status !== "succeeded" ||
			!pending.workspaceId ||
			workspaceSynced ||
			syncTimedOut ||
			navigatedRef.current
		) {
			return;
		}
		const timer = setTimeout(() => setSyncTimedOut(true), SYNC_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [pending?.status, pending?.workspaceId, workspaceSynced, syncTimedOut]);

	const doNavigate = useCallback(() => {
		if (!pending?.workspaceId || navigatedRef.current) return;
		navigatedRef.current = true;
		ensureWorkspaceInSidebar(pending.workspaceId, pending.projectId);

		if (pending.terminals.length > 0) {
			const paneLayout = buildSetupPaneLayout(pending.terminals);
			collections.v2WorkspaceLocalState.update(pending.workspaceId, (draft) => {
				draft.paneLayout = paneLayout;
			});
		}

		void navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: pending.workspaceId },
		});
		setTimeout(() => {
			collections.pendingWorkspaces.delete(pendingId);
		}, 1000);
	}, [collections, ensureWorkspaceInSidebar, navigate, pending, pendingId]);

	useEffect(() => {
		if (
			pending?.status === "succeeded" &&
			pending.workspaceId &&
			workspaceSynced
		) {
			doNavigate();
		}
	}, [pending?.status, pending?.workspaceId, workspaceSynced, doNavigate]);

	if (!pending) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Workspace not found
			</div>
		);
	}

	const creatingLabel =
		pending.intent === "adopt"
			? "Adopting worktree"
			: pending.intent === "checkout"
				? "Checking out branch"
				: "Setting up workspace";

	// Hold the keypad view through the real pre-navigation states. We do not wait
	// for the animation to catch up once the workspace is synced; navigation
	// should be gated only by workspace readiness, not loader timing.
	const showCreatingUI =
		pending.status === "creating" ||
		(pending.status === "succeeded" && !syncTimedOut);

	if (showCreatingUI) {
		return (
			<div className="flex h-full w-full flex-1 flex-col items-center justify-center px-8">
				<div className="flex w-full max-w-md flex-col items-center space-y-5 text-center">
					<KeypadLoader
						currentStep={displayedInitStep}
						muted={notificationSoundsMuted}
						volume={0.35 * (notificationVolume / 100)}
						ariaLabelByStep={V2_PENDING_KEYPAD_LABELS}
					/>

					<div className="space-y-1">
						<h2
							className={`text-lg font-medium ${isStale ? "text-amber-500" : "text-foreground"}`}
						>
							{isStale
								? "This is taking longer than expected..."
								: creatingLabel}
						</h2>
						<p className="text-sm text-muted-foreground">{pending.name}</p>
						<div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
							<GoGitBranch className="size-3.5" />
							<span className="font-mono">{pending.branchName}</span>
						</div>
					</div>

					<StepProgress
						currentStep={displayedInitStep}
						animate={false}
						messages={V2_PENDING_STEP_MESSAGES}
					/>

					<div className="flex items-center gap-3">
						<p className="text-xs text-muted-foreground/60">
							Takes 10s to a few minutes depending on the size of your repo
						</p>
						<span className="text-xs tabular-nums text-muted-foreground/50">
							{elapsedLabel}
						</span>
					</div>

					<button
						type="button"
						className="text-xs text-muted-foreground/45 transition-colors hover:text-muted-foreground"
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
		);
	}

	if (pending.status === "failed") {
		return (
			<div className="flex h-full w-full flex-1 flex-col items-center justify-center px-8">
				<div className="flex w-full max-w-md flex-col items-center space-y-5 text-center">
					<div className="space-y-1">
						<h2 className="text-lg font-medium text-foreground">
							Workspace setup failed
						</h2>
						<p className="text-sm text-muted-foreground">{pending.name}</p>
						<div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
							<GoGitBranch className="size-3.5" />
							<span className="font-mono">{pending.branchName}</span>
						</div>
					</div>

					<StepProgress
						currentStep="failed"
						messages={{ failed: "Failed to set up workspace" }}
					/>

					<p className="max-w-sm select-text break-words text-xs leading-relaxed text-destructive/75">
						{pending.error ?? "Failed to create workspace"}
					</p>

					<div className="flex items-center gap-4 pt-1">
						<button
							type="button"
							className="rounded-md border border-foreground/15 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-foreground/[0.04]"
							onClick={() => {
								firedRef.current = true; // prevent the mount-effect from racing
								void fireIntent();
							}}
						>
							Retry
						</button>
						<button
							type="button"
							className="text-xs text-muted-foreground/45 transition-colors hover:text-muted-foreground"
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
			</div>
		);
	}

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

				{pending.status === "succeeded" && syncTimedOut && !workspaceSynced && (
					<div className="space-y-4">
						<div className="flex items-start gap-2 text-sm text-amber-500">
							<HiExclamationTriangle className="size-4 mt-0.5 shrink-0" />
							<span>
								Workspace was created but hasn't synced to this device yet.
								Check your connection.
							</span>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
								onClick={() => setSyncTimedOut(false)}
							>
								Keep waiting
							</button>
							<button
								type="button"
								className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
								onClick={doNavigate}
							>
								Open anyway
							</button>
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
			</div>
		</div>
	);
}
