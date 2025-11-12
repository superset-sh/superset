import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "renderer/components/ui/dialog";
import { ScrollArea } from "@superset/ui/scroll-area";
import type { Workspace } from "shared/types";
import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";

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
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
		null,
	);

	const handleSelect = () => {
		if (selectedWorkspaceId) {
			onSelectWorkspace(selectedWorkspaceId);
			setSelectedWorkspaceId(null);
		}
	};

	const handleCreate = () => {
		setSelectedWorkspaceId(null);
		onCreateWorkspace();
	};

	return (
		<Dialog open={isOpen} onOpenChange={() => {}}>
			<DialogContent
				className="max-w-[600px] max-h-[80vh] flex flex-col"
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>Select Workspace</DialogTitle>
					<DialogDescription>
						Choose an existing workspace or create a new one to get started
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 flex flex-col overflow-hidden min-h-0">
					{workspaces.length > 0 ? (
						<>
							<ScrollArea className="flex-1 pr-4">
								<div className="space-y-2">
									{workspaces.map((workspace) => (
										<button
											key={workspace.id}
											type="button"
											onClick={() => setSelectedWorkspaceId(workspace.id)}
											className={`w-full text-left p-4 rounded-lg border transition-colors ${
												selectedWorkspaceId === workspace.id
													? "border-blue-500 bg-blue-500/10"
													: "border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600"
											}`}
										>
											<div className="flex items-start gap-3">
												<FolderOpen className="w-5 h-5 text-neutral-400 mt-0.5 shrink-0" />
												<div className="flex-1 min-w-0">
													<div className="font-medium text-white mb-1">
														{workspace.name}
													</div>
													<div className="text-sm text-neutral-400 truncate">
														{workspace.repoPath}
													</div>
													{workspace.worktrees.length > 0 && (
														<div className="text-xs text-neutral-500 mt-1">
															{workspace.worktrees.length}{" "}
															{workspace.worktrees.length === 1
																? "worktree"
																: "worktrees"}
														</div>
													)}
												</div>
											</div>
										</button>
									))}
								</div>
							</ScrollArea>
						</>
					) : (
						<div className="flex-1 flex items-center justify-center text-center py-8">
							<div className="space-y-2">
								<FolderOpen className="w-12 h-12 text-neutral-500 mx-auto" />
								<p className="text-neutral-400">
									No workspaces yet. Create one to get started.
								</p>
							</div>
						</div>
					)}
				</div>

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={handleCreate}
						className="flex items-center gap-2"
					>
						<Plus className="w-4 h-4" />
						Create New Workspace
					</Button>
					{workspaces.length > 0 && (
						<Button
							onClick={handleSelect}
							disabled={!selectedWorkspaceId}
							className="flex items-center gap-2"
						>
							<FolderOpen className="w-4 h-4" />
							Open Selected
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

