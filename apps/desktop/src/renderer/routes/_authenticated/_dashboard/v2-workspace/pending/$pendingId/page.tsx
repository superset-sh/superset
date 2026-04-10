import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiCheck, HiExclamationTriangle } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { clearAttachments } from "renderer/lib/pending-attachment-store";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/pending/$pendingId/",
)({
	component: PendingWorkspacePage,
});

const STEP_LABELS: Record<string, string> = {
	ensuring_repo: "Ensuring local repository",
	creating_worktree: "Creating worktree",
	registering: "Registering workspace",
};

const STEP_ORDER = ["ensuring_repo", "creating_worktree", "registering"];

function PendingWorkspacePage() {
	const { pendingId } = Route.useParams();
	const navigate = useNavigate();
	const collections = useCollections();
	const { activeHostUrl } = useLocalHostService();
	const navigatedRef = useRef(false);

	// Read pending workspace from collection
	const { data: pendingRows } = useLiveQuery(
		(q) =>
			q
				.from({ pw: collections.pendingWorkspaces })
				.where(({ pw }) => eq(pw.id, pendingId))
				.select(({ pw }) => ({ ...pw })),
		[collections, pendingId],
	);
	const pending = pendingRows?.[0] ?? null;

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

	const currentStep = progress?.step ?? null;

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
		<div className="flex h-full items-center justify-center">
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
						<p className="text-sm text-muted-foreground">
							Creating workspace...
						</p>
						<div className="space-y-2">
							{STEP_ORDER.map((step) => {
								const stepIndex = STEP_ORDER.indexOf(step);
								const currentIndex = currentStep
									? STEP_ORDER.indexOf(currentStep)
									: -1;
								const isDone = currentIndex > stepIndex;
								const isCurrent = currentStep === step;

								return (
									<div key={step} className="flex items-center gap-2.5 text-sm">
										{isDone ? (
											<HiCheck className="size-4 text-emerald-500" />
										) : isCurrent ? (
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
												isDone || isCurrent
													? "text-foreground"
													: "text-muted-foreground/50"
											}
										>
											{STEP_LABELS[step] ?? step}
										</span>
									</div>
								);
							})}
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
								onClick={() => handleRetry(pending, collections, navigate)}
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

async function handleRetry(
	pending: {
		id: string;
		projectId: string;
		name: string;
		branchName: string;
		prompt: string;
		compareBaseBranch: string | null;
		runSetupScript: boolean;
		linkedIssues: unknown[];
		linkedPR: unknown;
		hostTarget: unknown;
		attachmentCount: number;
	},
	collections: ReturnType<typeof useCollections>,
	_navigate: ReturnType<typeof useNavigate>,
) {
	// Reset status
	collections.pendingWorkspaces.update(pending.id, (draft) => {
		draft.status = "creating";
		draft.error = null;
	});

	// TODO: re-fire createWorkspace with the same data from the pending row
	// This needs access to the useCreateDashboardWorkspace hook which is
	// only available in React component context. For now, the retry just
	// resets the status — full retry wiring is a follow-up.
}
