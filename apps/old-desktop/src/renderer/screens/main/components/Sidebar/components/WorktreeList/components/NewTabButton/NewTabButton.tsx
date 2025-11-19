import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ChevronDown, Monitor, Plus, SquareTerminal } from "lucide-react";
import { useState } from "react";
import type { Workspace } from "shared/types";

interface NewTabButtonProps {
	currentWorkspace: Workspace;
	selectedWorktreeId: string;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onReload: () => void;
}

export function NewTabButton({
	currentWorkspace,
	selectedWorktreeId,
	onTabSelect,
	onReload,
}: NewTabButtonProps) {
	const [defaultTabType, setDefaultTabType] = useState<"terminal" | "preview">(
		() => {
			// Load from localStorage or default to "terminal"
			const saved = localStorage.getItem("newTabDefaultType");
			return (saved === "preview" ? "preview" : "terminal") as
				| "terminal"
				| "preview";
		},
	);

	const handleAddTerminal = async (updateDefault = false) => {
		if (!currentWorkspace || !selectedWorktreeId) return;

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

	return (
		<div className="space-y-0.5 mt-2">
			<div className="relative group">
				<button
					type="button"
					onClick={handleCreateDefault}
					className="flex items-center gap-1.5 w-full h-7 px-2.5 text-xs rounded-md transition-all hover:bg-neutral-800/40 text-neutral-400 hover:text-neutral-300"
				>
					<Plus size={12} className="shrink-0" />
					<span className="truncate flex-1 text-left">
						{defaultTabType === "terminal" ? "New Terminal" : "New Preview"}
					</span>
				</button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="absolute right-1 top-1/2 -translate-y-1/2 shrink-0 opacity-0 group-hover:opacity-60 hover:opacity-100 p-1 rounded transition-opacity"
							onMouseDown={(e) => e.stopPropagation()}
						>
							<ChevronDown size={14} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						side="bottom"
						className="w-[--radix-dropdown-menu-trigger-width] bg-neutral-800 border-neutral-700"
					>
						<DropdownMenuItem
							onClick={() => handleAddTerminal(defaultTabType !== "terminal")}
							className="text-neutral-300"
						>
							<SquareTerminal size={14} className="text-neutral-400" />
							<span>New Terminal</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => handleAddPreview(defaultTabType !== "preview")}
							className="text-neutral-300"
						>
							<Monitor size={14} className="text-neutral-400" />
							<span>New Preview</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
