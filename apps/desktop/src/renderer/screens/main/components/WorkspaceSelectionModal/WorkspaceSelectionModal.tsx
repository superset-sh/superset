import { Download, FolderOpen, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
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
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Show recent workspaces (limit to 5 for display)
	const recentWorkspaces = workspaces.slice(0, 5);

	// Total navigable items: 2 action buttons + recent workspaces
	// (excluding disabled SSH button)
	const totalItems = 2 + recentWorkspaces.length;

	// Reset selected index when modal opens or workspaces change
	useEffect(() => {
		if (isOpen) {
			setSelectedIndex(0);
		}
	}, [isOpen, workspaces]);

	// Handle keyboard navigation
	useEffect(() => {
		if (!isOpen || showCloneDialog) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			switch (e.key) {
				case "ArrowDown":
				case "ArrowRight":
					e.preventDefault();
					setSelectedIndex((prev) =>
						prev < totalItems - 1 ? prev + 1 : prev,
					);
					break;
				case "ArrowUp":
				case "ArrowLeft":
					e.preventDefault();
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
					break;
				case "Enter":
					e.preventDefault();
					handleSelectItem(selectedIndex);
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, showCloneDialog, selectedIndex, totalItems, recentWorkspaces]);

	const handleSelectItem = (index: number) => {
		if (index === 0) {
			// Open project button
			handleOpenProject();
		} else if (index === 1) {
			// Clone from URL button
			setShowCloneDialog(true);
		} else {
			// Recent workspace (offset by 2 for the buttons)
			const workspaceIndex = index - 2;
			if (recentWorkspaces[workspaceIndex]) {
				handleSelect(recentWorkspaces[workspaceIndex].id);
			}
		}
	};

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

	return (
		<Dialog open={isOpen} onOpenChange={() => {}}>
			<DialogContent
				className="max-w-fit max-h-[85vh] p-3 md:p-6 bg-[#1e1e1e] border border-neutral-800"
				overlayClassName="bg-black/80"
				showCloseButton={false}
			>
				{/* Title */}
				<div className="mb-4 md:mb-6">
					<h1 className="text-4xl md:text-5xl font-micro5 text-white text-center">
						SUPERSET
					</h1>
				</div>

				{/* Action Cards */}
				<div className="flex flex-col md:flex-row gap-3 md:gap-4 mb-4 md:mb-6">
					<button
						type="button"
						onClick={handleOpenProject}
						onMouseEnter={() => setSelectedIndex(0)}
						className={`group flex flex-col items-center justify-center w-full md:w-52 h-32 px-3 py-4 rounded-lg border transition-all ${
							selectedIndex === 0
								? "bg-neutral-700/50 border-neutral-500"
								: "bg-neutral-800/50 hover:bg-neutral-800 border-neutral-700 hover:border-neutral-600"
						}`}
					>
						<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-700/50 mb-2">
							<FolderOpen className="w-5 h-5 text-neutral-300" />
						</div>
						<div className="text-sm font-medium text-white">Open project</div>
					</button>

					<button
						type="button"
						onClick={() => setShowCloneDialog(true)}
						onMouseEnter={() => setSelectedIndex(1)}
						className={`group flex flex-col items-center justify-center w-full md:w-52 h-32 px-3 py-4 rounded-lg border transition-all ${
							selectedIndex === 1
								? "bg-neutral-700/50 border-neutral-500"
								: "bg-neutral-800/50 hover:bg-neutral-800 border-neutral-700 hover:border-neutral-600"
						}`}
					>
						<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-700/50 mb-2">
							<Download className="w-5 h-5 text-neutral-300" />
						</div>
						<div className="text-sm font-medium text-white">Clone from URL</div>
					</button>

					<button
						type="button"
						onClick={handleOpenProject}
						className="group flex flex-col items-center justify-center w-full md:w-52 h-32 px-3 py-4 rounded-lg border border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600 transition-all opacity-50 cursor-not-allowed"
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
							{recentWorkspaces.map((workspace, index) => {
								const itemIndex = index + 2; // Offset by 2 for the action buttons
								return (
									<button
										key={workspace.id}
										type="button"
										onClick={() => handleSelect(workspace.id)}
										onMouseEnter={() => setSelectedIndex(itemIndex)}
										className={`w-full flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg transition-colors cursor-pointer text-left ${
											itemIndex === selectedIndex
												? "bg-neutral-700/50 border border-neutral-600"
												: "hover:bg-neutral-800/50 border border-transparent"
										}`}
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
								);
							})}
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
