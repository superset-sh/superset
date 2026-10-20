import { useCallback, useState } from "react";
import type { BaseBranchSource } from "../../../../../DashboardNewWorkspaceDraftContext";
import type { RemoteHostPresence } from "../../../../../utils/resolveRemoteHostPresence";
import {
	type BranchFilter,
	type CloudRepository,
	useBranchContext,
} from "../../../hooks/useBranchContext";
import type {
	CompareBaseBranchPicker,
	OpenWorkspaceTarget,
} from "../../components/CompareBaseBranchPicker";

type PickerProps = React.ComponentProps<typeof CompareBaseBranchPicker>;

export interface UseBranchPickerControllerArgs {
	projectId: string | null;
	hostId: string | null;
	remoteHostPresence: RemoteHostPresence | null;
	/** Cloud only: the primary repository whose branches are offered. */
	cloudRepository?: CloudRepository | null;
	baseBranch: string | null;
	onBaseBranchChange: (
		branch: string | null,
		source: BaseBranchSource | null,
	) => void;
	/**
	 * Opens the picked branch/worktree through the form's submit pipeline, so
	 * the prompt, attachments and linked context launch with it.
	 */
	onOpenWorkspace: (target: OpenWorkspaceTarget) => void;
}

/** Returns a `pickerProps` object ready to spread into `<CompareBaseBranchPicker />`. */
export function useBranchPickerController(args: UseBranchPickerControllerArgs) {
	const {
		projectId,
		hostId,
		remoteHostPresence,
		cloudRepository = null,
		baseBranch,
		onBaseBranchChange,
		onOpenWorkspace,
	} = args;

	const [branchSearch, setBranchSearch] = useState("");
	const [branchFilter, setBranchFilter] = useState<BranchFilter>("all");

	const {
		branches,
		defaultBranch,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
		error: branchesError,
		isRefetching: isBranchesRefetching,
		refetch: refetchBranches,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useBranchContext(
		projectId,
		hostId,
		branchSearch,
		branchFilter,
		cloudRepository,
		remoteHostPresence !== "offline" && remoteHostPresence !== "connecting",
	);

	const effectiveCompareBaseBranch = baseBranch || defaultBranch || null;

	const onSelectCompareBaseBranch = useCallback(
		(branch: string, source: BaseBranchSource) => {
			onBaseBranchChange(branch, source);
		},
		[onBaseBranchChange],
	);

	const onLoadMore = useCallback(() => {
		void fetchNextPage();
	}, [fetchNextPage]);

	const onRetryBranches = useCallback(() => {
		void refetchBranches();
	}, [refetchBranches]);

	const pickerProps: PickerProps = {
		effectiveCompareBaseBranch,
		defaultBranch,
		isBranchesLoading: isBranchesLoading || remoteHostPresence === "connecting",
		isBranchesError,
		branchesError,
		isBranchesRefetching,
		onRetryBranches,
		isHostOffline: remoteHostPresence === "offline",
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
