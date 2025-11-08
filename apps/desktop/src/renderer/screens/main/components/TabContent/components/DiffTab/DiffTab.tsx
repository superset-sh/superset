import { Button } from "@superset/ui/button";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Tab, Worktree } from "shared/types";
import { DiffView } from "../../../DiffView/DiffView";
import type { DiffViewData } from "../../../DiffView/types";

interface DiffTabProps {
	tab: Tab;
	workspaceId: string;
	worktreeId: string;
	worktree?: Worktree;
	workspaceName?: string;
	mainBranch?: string;
	onClose?: () => void;
}

export function DiffTab({
	tab,
	workspaceId,
	worktreeId,
	worktree,
	workspaceName,
	mainBranch,
	onClose,
}: DiffTabProps) {
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [diffData, setDiffData] = useState<DiffViewData | null>(null);
	const [error, setError] = useState<string | null>(null);

	const loadDiff = useCallback(
		async (isRefresh = false) => {
			if (isRefresh) {
				setRefreshing(true);
			} else {
				setLoading(true);
			}
			setError(null);

			try {
				const result = await window.ipcRenderer.invoke(
					"worktree-get-git-diff",
					{
						workspaceId,
						worktreeId,
					},
				);

				if (
					result &&
					typeof result === "object" &&
					"success" in result &&
					result.success &&
					"diff" in result &&
					result.diff
				) {
					// Transform the diff data to match DiffViewData format
					const diffViewData: DiffViewData = {
						title: `Changes in ${worktree?.branch || "worktree"}`,
						description: workspaceName
							? `Workspace: ${workspaceName}`
							: undefined,
						timestamp: new Date().toLocaleString(),
						files: result.diff.files,
					};
					setDiffData(diffViewData);
				} else {
					const errorMsg =
						result && typeof result === "object" && "error" in result
							? result.error
							: "Failed to load diff";
					setError(errorMsg || "Failed to load diff");
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				if (isRefresh) {
					setRefreshing(false);
				} else {
					setLoading(false);
				}
			}
		},
		[workspaceId, worktreeId, worktree?.branch, workspaceName],
	);

	const handleRefresh = useCallback(() => {
		loadDiff(true);
	}, [loadDiff]);

	useEffect(() => {
		loadDiff(false);
	}, [loadDiff]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full bg-[#1a1a1a]">
				<div className="text-center space-y-3">
					<div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-700 border-t-zinc-400 mx-auto" />
					<p className="text-xs text-zinc-500">Loading diff...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full bg-[#1a1a1a]">
				<div className="text-center space-y-4 max-w-md px-6">
					<AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
					<h3 className="text-sm font-medium text-zinc-200">
						Error Loading Diff
					</h3>
					<p className="text-xs text-zinc-500 leading-relaxed">{error}</p>
					<Button
						onClick={() => loadDiff(false)}
						variant="outline"
						className="h-8 px-3 text-xs"
					>
						<RefreshCw className="w-3.5 h-3.5 mr-2" />
						Try Again
					</Button>
				</div>
			</div>
		);
	}

	if (!diffData || diffData.files.length === 0) {
		return (
			<div className="flex items-center justify-center h-full bg-[#1a1a1a]">
				<div className="text-center space-y-4 max-w-md px-6">
					<div className="text-4xl text-emerald-400">✓</div>
					<h3 className="text-sm font-medium text-zinc-200">No Changes</h3>
					<p className="text-xs text-zinc-500 leading-relaxed">
						There are no changes in this worktree compared to{" "}
						{mainBranch || "the main branch"}.
					</p>
					<Button
						onClick={handleRefresh}
						variant="outline"
						disabled={refreshing}
						className="h-8 px-3 text-xs"
					>
						<RefreshCw
							className={`w-3.5 h-3.5 mr-2 ${refreshing ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full w-full">
			<DiffView
				data={diffData}
				onRefresh={handleRefresh}
				isRefreshing={refreshing}
				onClose={onClose}
			/>
		</div>
	);
}
