import { Download, FolderOpen, Terminal } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent } from "renderer/components/ui/dialog";
import type { Workspace } from "shared/types";
import { CloneFromUrlDialog } from "./CloneFromUrlDialog";

interface WorkspaceSelectionModalProps {
	isOpen: boolean;
	workspaces: Workspace[];
	onSelectWorkspace: (workspaceId: string) => void;
	onCreateWorkspace: () => void;
}

export function WorkspaceSelectionModal({
	isOpen,
	workspaces,
	onSelectWorkspace,
	onCreateWorkspace,
}: WorkspaceSelectionModalProps) {
	const [showCloneDialog, setShowCloneDialog] = useState(false);

	const handleSelect = (workspaceId: string) => {
		onSelectWorkspace(workspaceId);
	};

	const handleOpenProject = () => {
		onCreateWorkspace();
	};

	const handleCloneFromUrl = async (url: string, destinationPath: string) => {
		try {
			const result = await window.ipcRenderer.invoke(
				"workspace-clone-from-url",
				{
					url,
					destinationPath,
				},
			);

			if (result.success && result.data) {
				// Close the clone dialog
				setShowCloneDialog(false);
				// Select the newly created workspace
				onSelectWorkspace(result.data.id);
			} else {
				// Error will be shown by the dialog
				throw new Error(result.error || "Failed to clone repository");
			}
		} catch (error) {
			console.error("Failed to clone repository:", error);
			throw error;
		}
	};

	// Show recent workspaces (limit to 5 for display)
	const recentWorkspaces = workspaces.slice(0, 5);

	return (
		<Dialog open={isOpen} onOpenChange={() => {}}>
			<DialogContent
				className="max-w-fit max-h-[85vh] p-6 bg-[#1e1e1e] border border-neutral-800"
				overlayClassName="bg-black/80"
				showCloseButton={false}
			>
				{/* Title */}
				<div className="mb-6">
					<h1 className="text-3xl font-semibold text-white text-center">
						Superset
					</h1>
				</div>

				{/* Action Cards */}
				<div className="flex gap-4 mb-6">
					<button
						type="button"
						onClick={handleOpenProject}
						className="group flex flex-col items-center justify-center w-52 h-32 px-3 py-4 rounded-lg border border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600 transition-all"
					>
						<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-700/50 mb-2">
							<FolderOpen className="w-5 h-5 text-neutral-300" />
						</div>
						<div className="text-sm font-medium text-white">Open project</div>
					</button>

					<button
						type="button"
						onClick={() => setShowCloneDialog(true)}
						className="group flex flex-col items-center justify-center w-52 h-32 px-3 py-4 rounded-lg border border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600 transition-all"
					>
						<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-700/50 mb-2">
							<Download className="w-5 h-5 text-neutral-300" />
						</div>
						<div className="text-sm font-medium text-white">Clone from URL</div>
					</button>

					<button
						type="button"
						onClick={handleOpenProject}
						className="group flex flex-col items-center justify-center w-52 h-32 px-3 py-4 rounded-lg border border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600 transition-all opacity-50 cursor-not-allowed"
						disabled
						title="Coming soon"
					>
						<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-700/50 mb-2">
							<Terminal className="w-5 h-5 text-neutral-300" />
						</div>
						<div className="text-sm font-medium text-white">
							Connect via SSH
						</div>
					</button>
				</div>

				{/* Recent Projects Section */}
				{recentWorkspaces.length > 0 && (
					<div className="mt-6">
						<div className="flex items-center justify-between mb-3">
							<h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
								Recent
							</h3>
						</div>

						<div className="space-y-1">
							{recentWorkspaces.map((workspace) => (
								<button
									key={workspace.id}
									type="button"
									onClick={() => handleSelect(workspace.id)}
									className="w-full flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg transition-colors cursor-pointer hover:bg-neutral-800/50 text-left"
								>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium truncate text-neutral-200">
											{workspace.name}
										</div>
									</div>
									<div className="shrink-0">
										<div className="text-xs text-neutral-500 truncate max-w-xs">
											{workspace.repoPath}
										</div>
									</div>
								</button>
							))}
						</div>
					</div>
				)}
			</DialogContent>

			<CloneFromUrlDialog
				open={showCloneDialog}
				onOpenChange={setShowCloneDialog}
				onClone={handleCloneFromUrl}
			/>
		</Dialog>
	);
}
