import type { SelectCloudWorkspace } from "@superset/db/schema";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HiChevronDown, HiOutlineCloud, HiOutlinePlus } from "react-icons/hi2";
import { CloudWorkspaceListItem } from "renderer/components/CloudWorkspace";
import {
	useCloudWorkspaces,
	useCloudWorkspacesByStatus,
} from "renderer/react-query/cloud-workspaces";
import { useOpenCloudWorkspaceModal } from "renderer/stores/cloud-workspace-modal";

interface CloudWorkspaceSectionProps {
	isCollapsed?: boolean;
}

export function CloudWorkspaceSection({
	isCollapsed = false,
}: CloudWorkspaceSectionProps) {
	const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);
	const cloudWorkspaces = useCloudWorkspaces();
	const { running, provisioning } = useCloudWorkspacesByStatus();
	const openModal = useOpenCloudWorkspaceModal();

	// Don't render if no cloud workspaces and sidebar is collapsed
	if (cloudWorkspaces.length === 0 && isCollapsed) {
		return null;
	}

	const activeCount = running.length + provisioning.length;

	const handleConnect = (workspaceId: string) => {
		// TODO: Implement cloud workspace connection
		console.log("[cloud-workspace] Connect to workspace:", workspaceId);
	};

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center py-2 border-b border-border">
				<button
					type="button"
					onClick={() => setIsSectionCollapsed(!isSectionCollapsed)}
					className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors"
					title="Cloud Workspaces"
				>
					<HiOutlineCloud className="h-4 w-4 text-muted-foreground" />
				</button>
				<AnimatePresence initial={false}>
					{!isSectionCollapsed && cloudWorkspaces.length > 0 && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="overflow-hidden w-full"
						>
							<div className="flex flex-col items-center gap-1 pt-1">
								{cloudWorkspaces.map((workspace: SelectCloudWorkspace) => (
									<CloudWorkspaceListItem
										key={workspace.id}
										workspace={workspace}
										onConnect={() => handleConnect(workspace.id)}
									/>
								))}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		);
	}

	return (
		<div className="border-b border-border">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors">
				<button
					type="button"
					onClick={() => setIsSectionCollapsed(!isSectionCollapsed)}
					className="flex items-center gap-2 flex-1 min-w-0"
				>
					<HiChevronDown
						className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
							isSectionCollapsed ? "-rotate-90" : ""
						}`}
					/>
					<HiOutlineCloud className="h-4 w-4 text-sky-500" />
					<span className="text-sm font-medium truncate">Cloud Workspaces</span>
					{activeCount > 0 && (
						<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
							{activeCount} active
						</span>
					)}
				</button>
				<button
					type="button"
					onClick={() => openModal()}
					className="flex items-center justify-center w-6 h-6 rounded hover:bg-accent transition-colors"
					title="New Cloud Workspace"
				>
					<HiOutlinePlus className="h-3.5 w-3.5 text-muted-foreground" />
				</button>
			</div>

			{/* Workspace List */}
			<AnimatePresence initial={false}>
				{!isSectionCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="pb-1">
							{cloudWorkspaces.length === 0 ? (
								<div className="px-3 py-4 text-center">
									<p className="text-xs text-muted-foreground">
										No cloud workspaces yet
									</p>
									<button
										type="button"
										onClick={() => openModal()}
										className="mt-2 text-xs text-primary hover:underline"
									>
										Create your first cloud workspace
									</button>
								</div>
							) : (
								cloudWorkspaces.map((workspace: SelectCloudWorkspace) => (
									<CloudWorkspaceListItem
										key={workspace.id}
										workspace={workspace}
										onConnect={() => handleConnect(workspace.id)}
									/>
								))
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
