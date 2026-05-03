import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import type { BaseBranchSource } from "../../../../../DashboardNewWorkspaceDraftContext";
import {
	type BranchFilter,
	useBranchContext,
} from "../../../hooks/useBranchContext";
import type { CompareBaseBranchPicker } from "../../components/CompareBaseBranchPicker";

type PickerProps = React.ComponentProps<typeof CompareBaseBranchPicker>;

export interface UseBranchPickerControllerArgs {
	projectId: string | null;
	hostId: string | null;
	baseBranch: string | null;
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
 * dispatch, and the per-row action callbacks. Returns a single `pickerProps`
 * object ready to spread into `<CompareBaseBranchPicker />`.
 */
export function useBranchPickerController(args: UseBranchPickerControllerArgs) {
	const {
		projectId,
		hostId,
		baseBranch,
		typedWorkspaceName,
		onBaseBranchChange,
		closeModal,
	} = args;

	const navigate = useNavigate();
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { submit } = useWorkspaceCreates();

	// `null` means "local active machine" — pin to the device's own machineId
	// so workspace lookups (which key by hostId) resolve against the right host.
	const resolvedHostId = hostId ?? machineId;

	const [branchSearch, setBranchSearch] = useState("");
	const [branchFilter, setBranchFilter] = useState<BranchFilter>("all");

	const {
		branches,
		defaultBranch,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useBranchContext(projectId, hostId, branchSearch, branchFilter);

	const effectiveCompareBaseBranch = baseBranch || defaultBranch || null;

	// Authoritative "does a workspace already exist for this (project, branch,
	// host)?" — driven by the cloud-synced collection rather than the server's
	// per-row hasWorkspace snapshot, which can be stale after a delete.
	const { data: projectWorkspaces } = useLiveQuery(
		(q) => q.from({ workspaces: collections.v2Workspaces }),
		[collections],
	);

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		if (!projectId || !projectWorkspaces || !resolvedHostId) return map;
		for (const w of projectWorkspaces) {
			if (
				w.projectId === projectId &&
				w.hostId === resolvedHostId &&
				w.branch
			) {
				map.set(w.branch, w.id);
			}
		}
		return map;
	}, [projectId, projectWorkspaces, resolvedHostId]);

	const hasWorkspaceForBranch = useCallback(
		(name: string) => workspaceByBranch.has(name),
		[workspaceByBranch],
	);

	// Picker actions bypass the modal's submit, so they don't get the
	// `resolveNames` pass — fall back to the branch name when the user hasn't
	// typed a workspace name.
	const resolveActionWorkspaceName = useCallback(
		(branchName: string) => typedWorkspaceName.trim() || branchName,
		[typedWorkspaceName],
	);

	const onCheckoutBranch = useCallback(
		(branchName: string) => {
			if (!projectId) {
				toast.error("Select a project first");
				return;
			}
			if (!resolvedHostId) {
				toast.error("No active host");
				return;
			}
			const workspaceId = crypto.randomUUID();
			const workspaceName = resolveActionWorkspaceName(branchName);
			closeModal();
			void navigate({ to: `/v2-workspace/${workspaceId}` as string });
			void submit({
				hostId: resolvedHostId,
				snapshot: {
					id: workspaceId,
					projectId,
					name: workspaceName,
					branch: branchName,
				},
			});
		},
		[
			projectId,
			resolvedHostId,
			resolveActionWorkspaceName,
			submit,
			closeModal,
			navigate,
		],
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
		hasWorkspaceForBranch,
	};

	return { pickerProps };
}
