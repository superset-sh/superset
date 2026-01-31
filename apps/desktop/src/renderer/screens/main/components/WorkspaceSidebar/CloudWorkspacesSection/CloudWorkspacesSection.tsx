import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { LuChevronDown, LuCloud, LuPlus } from "react-icons/lu";
import { apiTrpc } from "renderer/lib/api-trpc";
import { ApiTRPCProvider } from "renderer/providers/ApiTRPCProvider";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { useCloudWorkspaceStore } from "renderer/stores/cloud-workspace";
import { CloudWorkspaceListItem } from "./CloudWorkspaceListItem";

const CLOUD_SECTION_ID = "cloud-workspaces";
const STROKE_WIDTH = 1.5;

interface CloudWorkspacesSectionProps {
	isCollapsed?: boolean;
}

/**
 * Wrapper that provides the API tRPC context for cloud workspace features.
 * Uses a stable provider instance to prevent query resets on re-renders.
 */
export function CloudWorkspacesSection(props: CloudWorkspacesSectionProps) {
	// Keep the provider stable across re-renders
	return (
		<ApiTRPCProvider queryClient={electronQueryClient}>
			<CloudWorkspacesSectionInner {...props} />
		</ApiTRPCProvider>
	);
}

/**
 * Inner component that handles collapse state without affecting the provider.
 */
function CloudWorkspacesSectionInner(props: CloudWorkspacesSectionProps) {
	const { isProjectCollapsed } = useWorkspaceSidebarStore();
	const isCollapsed = isProjectCollapsed(CLOUD_SECTION_ID);

	// Always render content - the collapse state is handled internally
	return <CloudWorkspacesSectionContent {...props} sectionCollapsed={isCollapsed} />;
}

interface CloudWorkspacesSectionContentProps extends CloudWorkspacesSectionProps {
	sectionCollapsed: boolean;
}

function CloudWorkspacesSectionContent({
	isCollapsed: isSidebarCollapsed = false,
	sectionCollapsed,
}: CloudWorkspacesSectionContentProps) {
	const { toggleProjectCollapsed } = useWorkspaceSidebarStore();
	const { activeSessionId, setActiveSession } = useCloudWorkspaceStore();

	const {
		data: cloudWorkspaces = [],
		isLoading,
		isError,
		isFetching,
	} = apiTrpc.cloudWorkspace.list.useQuery(undefined, {
		staleTime: 30_000, // 30 seconds
		retry: false, // Don't retry on failure
		refetchOnWindowFocus: false, // Prevent unnecessary refetches
		placeholderData: (prev) => prev, // Keep previous data while refetching
	});

	const archiveMutation = apiTrpc.cloudWorkspace.archive.useMutation({
		onSuccess: () => {
			toast.success("Workspace archived");
		},
		onError: (error) => {
			toast.error(`Failed to archive: ${error.message}`);
		},
	});

	const utils = apiTrpc.useUtils();

	const handleArchive = (id: string) => {
		archiveMutation.mutate(
			{ id },
			{
				onSuccess: () => {
					utils.cloudWorkspace.list.invalidate();
				},
			},
		);
	};

	const handleSelectWorkspace = (sessionId: string) => {
		setActiveSession(sessionId);
	};

	// Use the passed-in collapse state
	const isCollapsed = sectionCollapsed;

	// Don't render the section if API failed (server not running) or no workspaces
	// But keep it visible while loading to prevent flash
	if (isError || (!isLoading && cloudWorkspaces.length === 0)) {
		return null;
	}

	const handleNewCloudWorkspace = () => {
		// TODO: Open new cloud workspace modal
		toast.info("Cloud workspace creation coming soon");
	};

	if (isSidebarCollapsed) {
		return (
			<div className="flex flex-col items-center py-2 border-b border-border last:border-b-0">
				{/* Collapsed header */}
				<button
					type="button"
					onClick={() => toggleProjectCollapsed(CLOUD_SECTION_ID)}
					className="flex items-center justify-center size-8 rounded-md hover:bg-muted/50 transition-colors mb-1"
				>
					<LuCloud
						className="size-4 text-muted-foreground"
						strokeWidth={STROKE_WIDTH}
					/>
				</button>

				<AnimatePresence initial={false}>
					{!isCollapsed && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="overflow-hidden w-full"
						>
							<div className="flex flex-col items-center gap-1 pt-1">
								{cloudWorkspaces.map((workspace) => (
									<CloudWorkspaceListItem
										key={workspace.id}
										workspace={workspace}
										isActive={activeSessionId === workspace.sessionId}
										isCollapsed={isSidebarCollapsed}
										onArchive={() => handleArchive(workspace.id)}
										onSelect={() => handleSelectWorkspace(workspace.sessionId)}
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
		<div className="border-b border-border last:border-b-0">
			{/* Header */}
			<div className="flex items-center px-3 py-2 group">
				<button
					type="button"
					onClick={() => toggleProjectCollapsed(CLOUD_SECTION_ID)}
					className="flex items-center gap-2 flex-1 min-w-0"
				>
					<LuChevronDown
						className={cn(
							"size-3.5 text-muted-foreground transition-transform shrink-0",
							isCollapsed && "-rotate-90",
						)}
						strokeWidth={STROKE_WIDTH}
					/>
					<LuCloud
						className="size-4 text-muted-foreground shrink-0"
						strokeWidth={STROKE_WIDTH}
					/>
					<span className="text-sm font-medium truncate">Cloud Workspaces</span>
					<span className="text-xs text-muted-foreground ml-auto">
						{cloudWorkspaces.length}
					</span>
				</button>
				<button
					type="button"
					onClick={handleNewCloudWorkspace}
					className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted/50 rounded"
					aria-label="New cloud workspace"
				>
					<LuPlus
						className="size-3.5 text-muted-foreground"
						strokeWidth={STROKE_WIDTH}
					/>
				</button>
			</div>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="pb-1">
							{isLoading ? (
								<div className="px-3 py-2 text-sm text-muted-foreground">
									Loading...
								</div>
							) : (
								cloudWorkspaces.map((workspace) => (
									<CloudWorkspaceListItem
										key={workspace.id}
										workspace={workspace}
										isActive={activeSessionId === workspace.sessionId}
										onArchive={() => handleArchive(workspace.id)}
										onSelect={() => handleSelectWorkspace(workspace.sessionId)}
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
