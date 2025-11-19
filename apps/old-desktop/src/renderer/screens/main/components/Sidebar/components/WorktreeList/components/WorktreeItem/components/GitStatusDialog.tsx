import { Button } from "@superset/ui/button";
import { AlertCircle, CheckCircle, GitBranch } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "renderer/components/ui/dialog";

interface GitStatusDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
	worktreeId: string;
	worktreeBranch: string;
}

interface GitStatus {
	branch: string;
	ahead: number;
	behind: number;
	files: {
		staged: Array<{ path: string; status: string }>;
		unstaged: Array<{ path: string; status: string }>;
		untracked: Array<{ path: string }>;
	};
	diffAgainstMain: string;
	isMerging: boolean;
	isRebasing: boolean;
	conflictFiles: string[];
}

const getStatusLabel = (code: string): string => {
	const statusMap: Record<string, string> = {
		M: "Modified",
		A: "Added",
		D: "Deleted",
		R: "Renamed",
		C: "Copied",
		U: "Updated but unmerged",
	};
	return statusMap[code] || code;
};

export function GitStatusDialog({
	open,
	onOpenChange,
	workspaceId,
	worktreeId,
	worktreeBranch,
}: GitStatusDialogProps) {
	const [loading, setLoading] = useState(true);
	const [status, setStatus] = useState<GitStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [worktreePath, setWorktreePath] = useState<string>("");

	const loadGitStatus = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			// Get worktree path
			const path = await window.ipcRenderer.invoke("worktree-get-path", {
				workspaceId,
				worktreeId,
			});
			if (path) {
				setWorktreePath(path);
			}

			// Get git status
			const result = await window.ipcRenderer.invoke(
				"worktree-get-git-status",
				{
					workspaceId,
					worktreeId,
				},
			);

			if (result.success && result.status) {
				setStatus(result.status);
			} else {
				setError(result.error || "Failed to load git status");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}, [workspaceId, worktreeId]);

	useEffect(() => {
		if (open) {
			loadGitStatus();
		}
	}, [open, loadGitStatus]);

	const handleOpenFile = async (filePath: string) => {
		if (!worktreePath) return;
		const fullPath = `${worktreePath}/${filePath}`;
		await window.ipcRenderer.invoke(
			"open-external",
			`cursor://file/${fullPath}`,
		);
	};

	const parseDiffOutput = (diffOutput: string) => {
		const lines = diffOutput.split("\n");
		return lines.map((line, index) => {
			// Match file paths in diff stat output (e.g., " packages/ui/package.json | 4")
			const fileMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)/);
			if (fileMatch) {
				const [, filePath, changes] = fileMatch;
				const changeSymbols = line.substring(line.indexOf("|") + 1);
				return {
					type: "file" as const,
					filePath: filePath.trim(),
					changes,
					changeSymbols,
					line,
					index,
				};
			}
			// Summary line (e.g., "61 files changed, 4903 insertions(+), 3047 deletions(-)")
			if (line.match(/\d+ files? changed/)) {
				return { type: "summary" as const, line, index };
			}
			return { type: "other" as const, line, index };
		});
	};

	const totalChanges =
		(status?.files.staged.length || 0) +
		(status?.files.unstaged.length || 0) +
		(status?.files.untracked.length || 0);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[600px] md:max-w-[700px] lg:max-w-[900px] xl:max-w-[1200px] 2xl:max-w-[1400px] w-full max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<GitBranch size={18} />
						Git Status: {worktreeBranch}
					</DialogTitle>
					<DialogDescription>
						View the current git status and changes for this worktree
					</DialogDescription>
				</DialogHeader>

				{loading && (
					<div className="py-8 text-center text-gray-400">
						Loading git status...
					</div>
				)}

				{error && (
					<div className="p-4 bg-red-500/10 border border-red-500/30 rounded text-red-200">
						<div className="flex items-center gap-2">
							<AlertCircle size={18} />
							<span>{error}</span>
						</div>
					</div>
				)}

				{!loading && !error && status && (
					<div className="space-y-4">
						{/* Branch Status */}
						<div className="p-4 bg-neutral-800/50 rounded-lg space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-gray-300">
									Current Branch:
								</span>
								<span className="text-sm text-white font-mono">
									{status.branch}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-gray-300">
									Status:
								</span>
								<span className="text-sm">
									{totalChanges === 0 ? (
										<span className="flex items-center gap-1 text-green-400">
											<CheckCircle size={14} />
											Clean working tree
										</span>
									) : (
										<span className="text-yellow-400">
											{totalChanges} {totalChanges === 1 ? "change" : "changes"}
										</span>
									)}
								</span>
							</div>
							{(status.ahead > 0 || status.behind > 0) && (
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium text-gray-300">
										Sync Status:
									</span>
									<span className="text-sm">
										{status.ahead > 0 && (
											<span className="text-blue-400">
												↑ {status.ahead} ahead
											</span>
										)}
										{status.ahead > 0 && status.behind > 0 && (
											<span className="text-gray-400 mx-1">|</span>
										)}
										{status.behind > 0 && (
											<span className="text-orange-400">
												↓ {status.behind} behind
											</span>
										)}
									</span>
								</div>
							)}
						</div>

						{/* Merge/Rebase State */}
						{(status.isMerging || status.isRebasing) && (
							<div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
								<div className="flex items-center gap-2 text-yellow-400">
									<AlertCircle size={18} />
									<span className="font-medium">
										{status.isMerging
											? "Merge in progress"
											: "Rebase in progress"}
									</span>
								</div>
								{status.conflictFiles.length > 0 && (
									<div className="mt-2 space-y-1">
										<div className="text-sm text-yellow-200">
											Conflicts in {status.conflictFiles.length}{" "}
											{status.conflictFiles.length === 1 ? "file" : "files"}:
										</div>
										<div className="max-h-32 overflow-y-auto">
											{status.conflictFiles.map((file) => (
												<div
													key={file}
													className="text-xs font-mono text-yellow-100 pl-4"
												>
													{file}
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						)}

						{/* Staged Changes */}
						{status.files.staged.length > 0 && (
							<div className="space-y-2">
								<h3 className="text-sm font-medium text-green-400">
									Staged Changes ({status.files.staged.length})
								</h3>
								<div className="bg-neutral-800/30 rounded p-3 max-h-40 overflow-y-auto">
									{status.files.staged.map((file) => (
										<button
											key={file.path}
											type="button"
											onClick={() => handleOpenFile(file.path)}
											className="text-xs font-mono flex items-center gap-2 py-1 w-full hover:bg-neutral-700/50 px-2 rounded transition-colors text-left"
										>
											<span className="text-green-400 w-20">
												{getStatusLabel(file.status)}
											</span>
											<span className="text-gray-300 truncate">
												{file.path}
											</span>
										</button>
									))}
								</div>
							</div>
						)}

						{/* Unstaged Changes */}
						{status.files.unstaged.length > 0 && (
							<div className="space-y-2">
								<h3 className="text-sm font-medium text-yellow-400">
									Unstaged Changes ({status.files.unstaged.length})
								</h3>
								<div className="bg-neutral-800/30 rounded p-3 max-h-40 overflow-y-auto">
									{status.files.unstaged.map((file) => (
										<button
											key={file.path}
											type="button"
											onClick={() => handleOpenFile(file.path)}
											className="text-xs font-mono flex items-center gap-2 py-1 w-full hover:bg-neutral-700/50 px-2 rounded transition-colors text-left"
										>
											<span className="text-yellow-400 w-20">
												{getStatusLabel(file.status)}
											</span>
											<span className="text-gray-300 truncate">
												{file.path}
											</span>
										</button>
									))}
								</div>
							</div>
						)}

						{/* Untracked Files */}
						{status.files.untracked.length > 0 && (
							<div className="space-y-2">
								<h3 className="text-sm font-medium text-gray-400">
									Untracked Files ({status.files.untracked.length})
								</h3>
								<div className="bg-neutral-800/30 rounded p-3 max-h-40 overflow-y-auto">
									{status.files.untracked.map((file) => (
										<button
											key={file.path}
											type="button"
											onClick={() => handleOpenFile(file.path)}
											className="text-xs font-mono flex items-center gap-2 py-1 w-full hover:bg-neutral-700/50 px-2 rounded transition-colors text-left"
										>
											<span className="text-gray-400 w-20">Untracked</span>
											<span className="text-gray-300 truncate">
												{file.path}
											</span>
										</button>
									))}
								</div>
							</div>
						)}

						{/* Diff Against Main */}
						{status.diffAgainstMain && (
							<div className="space-y-2">
								<h3 className="text-sm font-medium text-blue-400">
									Diff Against Main Branch
								</h3>
								<div
									className="bg-neutral-900 rounded p-4 overflow-y-auto"
									style={{ maxHeight: "400px" }}
								>
									<div className="space-y-0.5">
										{parseDiffOutput(status.diffAgainstMain).map((item) => {
											if (item.type === "file") {
												return (
													<button
														key={item.index}
														type="button"
														onClick={() => handleOpenFile(item.filePath)}
														className="text-xs font-mono flex items-start gap-3 py-0.5 w-full hover:bg-neutral-800/50 px-2 -mx-2 rounded transition-colors text-left group"
													>
														<span className="text-gray-300 group-hover:text-white transition-colors flex-1 truncate">
															{item.filePath}
														</span>
														<span className="text-gray-500 shrink-0">
															{item.changeSymbols}
														</span>
													</button>
												);
											}
											if (item.type === "summary") {
												return (
													<div
														key={item.index}
														className="text-xs font-mono text-gray-400 pt-2 mt-2 border-t border-neutral-800"
													>
														{item.line}
													</div>
												);
											}
											return (
												<div
													key={item.index}
													className="text-xs font-mono text-gray-500"
												>
													{item.line}
												</div>
											);
										})}
									</div>
								</div>
							</div>
						)}

						{/* Clean State */}
						{totalChanges === 0 && !status.diffAgainstMain && (
							<div className="text-center py-8 text-gray-400">
								<CheckCircle
									size={48}
									className="mx-auto mb-2 text-green-400"
								/>
								<p>Working tree is clean</p>
								<p className="text-sm text-gray-500 mt-1">
									No uncommitted changes
								</p>
							</div>
						)}
					</div>
				)}

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
