import { ChevronDown, Monitor, Plus, SquareTerminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Workspace, Worktree } from "shared/types";
import { WorkspacePortIndicator } from "../WorkspacePortIndicator";
import { WorktreeItem } from "./components/WorktreeItem";

interface WorktreeListProps {
	currentWorkspace: Workspace | null;
	expandedWorktrees: Set<string>;
	onToggleWorktree: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
	onCloneWorktree: (worktreeId: string, branch: string) => void;
	selectedWorktreeId?: string | null;
	showWorkspaceHeader?: boolean;
}

export function WorktreeList({
	currentWorkspace,
	expandedWorktrees: _expandedWorktrees,
	onToggleWorktree: _onToggleWorktree,
	onTabSelect,
	onReload,
	onUpdateWorktree,
	selectedTabId,
	onCloneWorktree,
	selectedWorktreeId,
	showWorkspaceHeader = false,
}: WorktreeListProps) {
	// Hooks must be called before any early returns
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [defaultTabType, setDefaultTabType] = useState<"terminal" | "preview">(
		() => {
			// Load from localStorage or default to "terminal"
			const saved = localStorage.getItem("newTabDefaultType");
			return (saved === "preview" ? "preview" : "terminal") as
				| "terminal"
				| "preview";
		},
	);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const chevronRef = useRef<HTMLButtonElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				buttonRef.current &&
				chevronRef.current &&
				!dropdownRef.current.contains(event.target as Node) &&
				!buttonRef.current.contains(event.target as Node) &&
				!chevronRef.current.contains(event.target as Node)
			) {
				setIsDropdownOpen(false);
			}
		};

		if (isDropdownOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => {
				document.removeEventListener("mousedown", handleClickOutside);
			};
		}
	}, [isDropdownOpen]);

	if (!currentWorkspace) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">No workspace open</div>
		);
	}

	if (!currentWorkspace.worktrees || currentWorkspace.worktrees.length === 0) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">
				No worktrees yet. Create one to get started.
			</div>
		);
	}

	// Check if workspace has port forwarding configured
	const hasPortForwarding =
		currentWorkspace.ports && currentWorkspace.ports.length > 0;

	const handleAddTerminal = async (updateDefault = false) => {
		if (!currentWorkspace || !selectedWorktreeId) return;
		setIsDropdownOpen(false);

		if (updateDefault) {
			setDefaultTabType("terminal");
			localStorage.setItem("newTabDefaultType", "terminal");
		}

		try {
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId: currentWorkspace.id,
				worktreeId: selectedWorktreeId,
				name: "New Terminal",
				type: "terminal",
			});

			if (result.success) {
				const newTabId = result.tab?.id;
				if (newTabId) {
					onTabSelect(selectedWorktreeId, newTabId);
				}
				onReload();
			}
		} catch (error) {
			console.error("Error creating terminal:", error);
		}
	};

	const handleAddPreview = async (updateDefault = false) => {
		if (!currentWorkspace || !selectedWorktreeId) return;
		setIsDropdownOpen(false);

		if (updateDefault) {
			setDefaultTabType("preview");
			localStorage.setItem("newTabDefaultType", "preview");
		}

		try {
			const worktree = currentWorkspace.worktrees.find(
				(wt) => wt.id === selectedWorktreeId,
			);
			const previewTabs =
				worktree?.tabs?.filter((tab) => tab.type === "preview") || [];
			const previewNumber = previewTabs.length + 1;

			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId: currentWorkspace.id,
				worktreeId: selectedWorktreeId,
				name: `Preview ${previewNumber}`,
				type: "preview",
			});

			if (result.success) {
				const newTabId = result.tab?.id;
				if (newTabId) {
					onTabSelect(selectedWorktreeId, newTabId);
				}
				onReload();
			}
		} catch (error) {
			console.error("Error creating preview:", error);
		}
	};

	const handleCreateDefault = () => {
		if (defaultTabType === "terminal") {
			handleAddTerminal();
		} else {
			handleAddPreview();
		}
	};

	const handleChevronClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsDropdownOpen(!isDropdownOpen);
	};

	return (
		<>
			{/* Workspace Header - more minimal */}
			{showWorkspaceHeader && currentWorkspace && (
				<div className="px-3 pt-2 pb-1.5">
					<WorkspacePortIndicator workspace={currentWorkspace} />
				</div>
			)}

			{currentWorkspace.worktrees.map((worktree) => (
				<WorktreeItem
					key={worktree.id}
					worktree={worktree}
					workspaceId={currentWorkspace.id}
					activeWorktreeId={currentWorkspace.activeWorktreeId}
					onTabSelect={onTabSelect}
					onReload={onReload}
					onUpdateWorktree={(updatedWorktree) =>
						onUpdateWorktree(worktree.id, updatedWorktree)
					}
					selectedTabId={selectedTabId}
					hasPortForwarding={hasPortForwarding}
					onCloneWorktree={() => onCloneWorktree(worktree.id, worktree.branch)}
				/>
			))}

			{/* Arc-style New Tab Button - styled like a tab at the bottom */}
			{selectedWorktreeId && (
				<div className="space-y-0.5 mt-2">
					<div className="relative">
						<button
							ref={buttonRef}
							type="button"
							onClick={handleCreateDefault}
							className={`group flex items-center gap-1.5 w-full h-7 px-2.5 text-xs rounded-md transition-all hover:bg-neutral-800/40 text-neutral-400 hover:text-neutral-300`}
						>
							<Plus size={12} className="shrink-0" />
							<span className="truncate flex-1 text-left">
								{defaultTabType === "terminal" ? "New Terminal" : "New Preview"}
							</span>
							<button
								ref={chevronRef}
								type="button"
								onClick={handleChevronClick}
								className="shrink-0 opacity-0 group-hover:opacity-60 hover:opacity-100 p-1 rounded transition-opacity"
								onMouseDown={(e) => e.stopPropagation()}
							>
								<ChevronDown
									size={14}
									className={`transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
								/>
							</button>
						</button>

						{/* Dropdown Menu */}
						{isDropdownOpen && (
							<div
								ref={dropdownRef}
								className="absolute bottom-full left-0 right-0 mb-1 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg z-50 overflow-hidden"
							>
								<button
									type="button"
									onClick={() =>
										handleAddTerminal(defaultTabType !== "terminal")
									}
									className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${defaultTabType === "terminal"
										? "bg-neutral-700/50 text-neutral-200"
										: "text-neutral-300 hover:bg-neutral-700/50"
										}`}
								>
									<SquareTerminal size={14} className="text-neutral-400" />
									<span>New Terminal</span>
								</button>
								<button
									type="button"
									onClick={() =>
										handleAddPreview(defaultTabType !== "preview")
									}
									className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${defaultTabType === "preview"
										? "bg-neutral-700/50 text-neutral-200"
										: "text-neutral-300 hover:bg-neutral-700/50"
										}`}
								>
									<Monitor size={14} className="text-neutral-400" />
									<span>New Preview</span>
								</button>
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
}
