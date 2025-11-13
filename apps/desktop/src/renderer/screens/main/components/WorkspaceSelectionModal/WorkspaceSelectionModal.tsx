import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Download, FolderOpen, Settings, Terminal } from "lucide-react";
import { Dialog, DialogContent } from "renderer/components/ui/dialog";
import type { Workspace } from "shared/types";

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
	const handleSelect = (workspaceId: string) => {
		onSelectWorkspace(workspaceId);
	};

	const handleOpenProject = () => {
		onCreateWorkspace();
	};

	// Show recent workspaces (limit to 5 for display)
	const recentWorkspaces = workspaces.slice(0, 5);

	return (
		<Dialog open={isOpen} onOpenChange={() => { }}>
			<DialogContent
				className="max-w-[900px] max-h-[85vh] flex flex-col p-0 bg-[#1e1e1e] border-neutral-800"
				showCloseButton={false}
			>
				<div className="flex flex-col h-full">
					{/* Header */}
					<div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-neutral-800">
						<div className="flex items-center gap-2">
							<span className="text-lg font-semibold text-white">Select Workspace</span>
						</div>
						<Button
							variant="ghost"
							onClick={() => {
								window.ipcRenderer.invoke("open-app-settings");
							}}
						>
							<Settings className="w-4 h-4 inline mr-1" />
							Settings
						</Button>
					</div>

					{/* Main Content */}
					<div className="flex-1 overflow-hidden flex flex-col">
						<div className="px-8 pt-8 pb-6">
							{/* Action Cards */}
							<div className="grid grid-cols-3 gap-4 mb-8">
								<button
									type="button"
									onClick={handleOpenProject}
									className="group relative p-6 rounded-lg border border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600 transition-all text-left"
								>
									<FolderOpen className="w-6 h-6 text-neutral-400 group-hover:text-blue-500 transition-colors mb-3" />
									<div className="text-sm font-medium text-white">
										Open folder
									</div>
								</button>

								<button
									type="button"
									onClick={handleOpenProject}
									className="group relative p-6 rounded-lg border border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600 transition-all text-left opacity-50 cursor-not-allowed"
									disabled
									title="Coming soon"
								>
									<Download className="w-6 h-6 text-neutral-400 group-hover:text-blue-500 transition-colors mb-3" />
									<div className="text-sm font-medium text-white">
										Clone repo
									</div>
								</button>

								<button
									type="button"
									onClick={handleOpenProject}
									className="group relative p-6 rounded-lg border border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600 transition-all text-left opacity-50 cursor-not-allowed"
									disabled
									title="Coming soon"
								>
									<Terminal className="w-6 h-6 text-neutral-400 group-hover:text-blue-500 transition-colors mb-3" />
									<div className="text-sm font-medium text-white">
										Connect via SSH
									</div>
								</button>
							</div>

							{/* Recent Projects Section */}
							{recentWorkspaces.length > 0 && (
								<div>
									<div className="flex items-center justify-between mb-4">
										<h3 className="text-sm font-medium text-neutral-300">
											Recent projects
										</h3>
										{workspaces.length > 5 && (
											<button
												type="button"
												className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors"
											>
												View all ({workspaces.length})
											</button>
										)}
									</div>

									<ScrollArea className="max-h-[300px]">
										<div className="space-y-0">
											{recentWorkspaces.map((workspace) => (
												<button
													key={workspace.id}
													type="button"
													onClick={() => handleSelect(workspace.id)}
													className="w-full flex items-center gap-8 px-3 py-1 transition-colors cursor-pointer hover:bg-neutral-800/50 text-left"
												>
													<div className="flex-1">
														<div className="text-sm font-medium truncate text-neutral-300">
															{workspace.name}
														</div>
													</div>
													<div className="flex-1">
														<div className="text-xs text-neutral-500 truncate">
															{workspace.repoPath}
														</div>
													</div>
												</button>
											))}
										</div>
									</ScrollArea>
								</div>
							)}

							{/* Empty State */}
							{workspaces.length === 0 && (
								<div className="flex flex-col items-center justify-center py-16 text-center">
									<FolderOpen className="w-16 h-16 text-neutral-600 mb-4" />
									<p className="text-neutral-400 text-sm mb-2">
										No workspaces yet
									</p>
									<p className="text-neutral-500 text-xs">
										Click "Open project" to get started
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
