import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { BaseBranchSource } from "../../../../../DashboardNewWorkspaceDraftContext";
import type { WorkspaceHostTarget } from "../../../components/DevicePicker";
import {
	type BranchFilter,
	useBranchContext,
} from "../../../hooks/useBranchContext";
import type { CompareBaseBranchPicker } from "../../components/CompareBaseBranchPicker";

type PickerProps = React.ComponentProps<typeof CompareBaseBranchPicker>;

export interface UseBranchPickerControllerArgs {
	projectId: string | null;
	hostTarget: WorkspaceHostTarget;
	baseBranch: string | null;
	runSetupScript: boolean;
	/** When set, used as the workspace name for picker actions; falls back to the branch name. */
	typedWorkspaceName: string;
	onBaseBranchChange: (
		branch: string | null,
		source: BaseBranchSource | null,
	) => void;
	closeModal: () => void;
}

/**
 * Owns all state + handlers for the branch picker: the search/filter inputs,
 * the branch-context query, the host-id resolution that gates Open/Create
 * dispatch, and the three per-row action callbacks. Returns a single
 * `pickerProps` object ready to spread into `<CompareBaseBranchPicker />`.
 *
 * See V2_WORKSPACE_CREATION.md §2 for the action model and §3 for the
 * pending-row insert + navigate flow.
 */
export function useBranchPickerController(args: UseBranchPickerControllerArgs) {
	const {
		projectId,
		hostTarget,
		baseBranch,
		runSetupScript,
		typedWorkspaceName,
		onBaseBranchChange,
		closeModal,
	} = args;

	const navigate = useNavigate();
	const collections = useCollections();
	const { machineId } = useLocalHostService();

	// Branch list state — owned by the controller so the picker is purely
	// presentational.
	const [branchSearch, setBranchSearch] = useState("");
	const [branchFilter, setBranchFilter] = useState<BranchFilter>("branch");

	const {
		branches,
		defaultBranch,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useBranchContext(projectId, hostTarget, branchSearch, branchFilter);

	const effectiveCompareBaseBranch = baseBranch || defaultBranch || null;

	// Authoritative "does a workspace already exist for this (project,
	// branch, host)?" — driven by the cloud-synced collection rather than
	// the server's per-row hasWorkspace snapshot, which can be stale after
	// a delete. See V2_WORKSPACE_CREATION.md §2.
	const { data: projectWorkspaces } = useLiveQuery(
		(q) => q.from({ workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: allHosts } = useLiveQuery(
		(q) => q.from({ hosts: collections.v2Hosts }),
		[collections],
	);

	// `v2Workspaces` rows are keyed by host id; collapsing by branch alone
	// would collide across hosts that happen to share a branch.
	const targetHostId = useMemo<string | null>(() => {
		if (hostTarget.kind === "host") return hostTarget.hostId;
		if (!machineId || !allHosts) return null;
		return allHosts.find((h) => h.machineId === machineId)?.id ?? null;
	}, [hostTarget, allHosts, machineId]);

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		if (!projectId || !projectWorkspaces || !targetHostId) return map;
		for (const w of projectWorkspaces) {
			if (w.projectId === projectId && w.hostId === targetHostId && w.branch) {
				map.set(w.branch, w.id);
			}
		}
		return map;
	}, [projectId, projectWorkspaces, targetHostId]);

	const hasWorkspaceForBranch = useCallback(
		(name: string) => workspaceByBranch.has(name),
		[workspaceByBranch],
	);

	// Picker actions (Create / Check out) bypass the modal's submit, so they
	// don't get the `resolveNames` pass — fall back to the branch name when
	// the user hasn't typed a workspace name.
	const resolveActionWorkspaceName = useCallback(
		(branchName: string) => typedWorkspaceName.trim() || branchName,
		[typedWorkspaceName],
	);

	const insertPendingAndNavigate = useCallback(
		(row: {
			pendingId: string;
			intent: "checkout" | "adopt";
			workspaceName: string;
			branchName: string;
		}) => {
			if (!projectId) {
				toast.error("Select a project first");
				return;
			}
			collections.pendingWorkspaces.insert({
				id: row.pendingId,
				projectId,
				intent: row.intent,
				name: row.workspaceName,
				branchName: row.branchName,
				prompt: "",
				baseBranch: null,
				baseBranchSource: null,
				runSetupScript,
				linkedIssues: [],
				linkedPR: null,
				hostTarget,
				attachmentCount: 0,
				status: "creating",
				error: null,
				workspaceId: null,
				warnings: [],
				createdAt: new Date(),
			});
			closeModal();
			void navigate({ to: `/pending/${row.pendingId}` as string });
		},
		[projectId, collections, runSetupScript, hostTarget, closeModal, navigate],
	);

	const onAdoptWorktree = useCallback(
		(branchName: string) => {
			insertPendingAndNavigate({
				pendingId: crypto.randomUUID(),
				intent: "adopt",
				workspaceName: resolveActionWorkspaceName(branchName),
				branchName,
			});
		},
		[insertPendingAndNavigate, resolveActionWorkspaceName],
	);

	const onCheckoutBranch = useCallback(
		(branchName: string) => {
			insertPendingAndNavigate({
				pendingId: crypto.randomUUID(),
				intent: "checkout",
				workspaceName: resolveActionWorkspaceName(branchName),
				branchName,
			});
		},
		[insertPendingAndNavigate, resolveActionWorkspaceName],
	);

	const onOpenExisting = useCallback(
		(branchName: string) => {
			const workspaceId = workspaceByBranch.get(branchName);
			if (!workspaceId) {
				toast.error("Could not find existing workspace for this branch");
				return;
			}
			closeModal();
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId },
			});
		},
		[workspaceByBranch, closeModal, navigate],
	);

	const onSelectCompareBaseBranch = useCallback(
		(branch: string, source: BaseBranchSource) => {
			onBaseBranchChange(branch, source);
		},
		[onBaseBranchChange],
	);

	const onLoadMore = useCallback(() => {
		void fetchNextPage();
	}, [fetchNextPage]);

	const pickerProps: PickerProps = {
		effectiveCompareBaseBranch,
		defaultBranch,
		isBranchesLoading,
		isBranchesError,
		branches,
		branchSearch,
		onBranchSearchChange: setBranchSearch,
		branchFilter,
		onBranchFilterChange: setBranchFilter,
		isFetchingNextPage,
		hasNextPage: hasNextPage ?? false,
		onLoadMore,
		onSelectCompareBaseBranch,
		onCheckoutBranch,
		onOpenExisting,
		onAdoptWorktree,
		hasWorkspaceForBranch,
	};

	return { pickerProps };
}
