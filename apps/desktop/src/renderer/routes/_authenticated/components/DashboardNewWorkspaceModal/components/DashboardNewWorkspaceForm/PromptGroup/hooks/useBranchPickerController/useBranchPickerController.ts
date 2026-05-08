import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
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
 * the branch-context query, the host-id resolution that gates dispatch, and
 * the per-row action callbacks. Returns a single `pickerProps` object ready
 * to spread into `<CompareBaseBranchPicker />`.
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

	// Picker actions bypass the modal's submit, so they don't get the
	// `resolveNames` pass — fall back to the branch name when the user hasn't
	// typed a workspace name.
	const resolveActionWorkspaceName = useCallback(
		(branchName: string) => typedWorkspaceName.trim() || branchName,
		[typedWorkspaceName],
	);

	// Single "go to a workspace for this branch" path. The server's
	// `workspaces.create` already covers all three cases:
	//   - Tracked workspace exists       → returns canonical row (alreadyExists)
	//   - Foreign worktree, no row yet   → adopts via adoptExistingWorktree
	//   - No worktree at all             → fresh `git worktree add`
	// Awaiting the result + navigating to the canonical id avoids the 404 you'd
	// hit by optimistically navigating to the snapshot id (server can return a
	// different id for the existing-row + adoption paths).
	const onOpenWorkspace = useCallback(
		async (branchName: string) => {
			if (!projectId) {
				toast.error("Select a project first");
				return;
			}
			if (!resolvedHostId) {
				toast.error("No active host");
				return;
			}
			const snapshotId = crypto.randomUUID();
			const workspaceName = resolveActionWorkspaceName(branchName);
			closeModal();
			const result = await submit({
				hostId: resolvedHostId,
				snapshot: {
					id: snapshotId,
					projectId,
					name: workspaceName,
					branch: branchName,
				},
			});
			if (result.ok) {
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: result.workspaceId },
				});
			} else {
				// `submit` tracks the failure via `markError`, but the in-flight
				// manager doesn't toast — without this, a rejected open closes
				// the modal silently and the user has no feedback that anything
				// failed.
				toast.error(result.error || "Failed to open workspace");
			}
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
		onOpenWorkspace,
	};

	return { pickerProps };
}
