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

/** Returns a `pickerProps` object ready to spread into `<CompareBaseBranchPicker />`. */
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

	// `null` hostId means "local active machine"; pin to the device's machineId
	// so workspace lookups (keyed by hostId) hit the right host.
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

	// Picker actions bypass the modal's submit pipeline (and its `resolveNames`
	// pass), so we mirror its branch-name fallback here.
	const resolveActionWorkspaceName = useCallback(
		(branchName: string) => typedWorkspaceName.trim() || branchName,
		[typedWorkspaceName],
	);

	// Server's `workspaces.create` resolves all three cases (open tracked,
	// adopt foreign worktree, fresh create). Await + navigate to the canonical
	// id — the existing-row and adoption paths can return an id different from
	// the optimistic snapshot id, which would otherwise 404.
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
				// `submit` records the failure for the in-flight tracker but
				// doesn't toast; surface it here so the closed modal isn't silent.
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
