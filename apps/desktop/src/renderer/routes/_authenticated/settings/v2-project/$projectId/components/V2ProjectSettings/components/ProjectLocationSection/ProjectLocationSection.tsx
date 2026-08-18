import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { LuFolderOpen } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { ClickablePath } from "../../../../../../components/ClickablePath";
import { SetupProjectModal } from "../SetupProjectModal";

interface ProjectLocationSectionProps {
	projectId: string;
	projectName?: string;
	currentPath: string | null;
	repoCloneUrl: string | null;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	onChanged?: () => void;
}

export function ProjectLocationSection({
	projectId,
	projectName,
	currentPath,
	repoCloneUrl,
	hostUrl,
	hostName,
	isRemoteTarget,
	onChanged,
}: ProjectLocationSectionProps) {
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { ensureProjectInSidebar, ensureWorkspaceInSidebar } =
		useDashboardSidebarState();

	const [pendingPath, setPendingPath] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [setupOpen, setSetupOpen] = useState(false);
	const [changeBrowseOpen, setChangeBrowseOpen] = useState(false);

	const pickPath = async (title: string) => {
		if (!hostUrl) {
			toast.error(`Host unavailable: ${hostName}`);
			return null;
		}
		try {
			const picked = await selectDirectory.mutateAsync({
				title,
				defaultPath: currentPath ?? undefined,
			});
			if (picked.canceled || !picked.path) return null;
			return picked.path;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
			return null;
		}
	};

	const proposeRelocate = async (path: string) => {
		if (path === currentPath) {
			toast.info("Project is already at that location");
			return;
		}
		if (!hostUrl) {
			toast.error(`Host unavailable: ${hostName}`);
			return;
		}
		setPendingPath(path);
	};

	const handleChange = async () => {
		if (isRemoteTarget) {
			setChangeBrowseOpen(true);
			return;
		}
		const path = await pickPath("Select new project location");
		if (!path) return;
		await proposeRelocate(path);
	};

	const handleConfirmRelocate = async () => {
		if (!pendingPath) return;
		if (!hostUrl) {
			toast.error(`Host unavailable: ${hostName}`);
			return;
		}
		setIsSubmitting(true);
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			const result = await client.project.setup.mutate({
				projectId,
				mode: { kind: "import", repoPath: pendingPath, allowRelocate: true },
			});
			toast.success(`Project relocated to ${result.repoPath}`);
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			setPendingPath(null);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			{currentPath ? (
				<div className="flex w-[28rem] max-w-full items-center gap-2">
					<div className="flex h-9 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-md border bg-transparent px-3 dark:bg-input/30">
						<ClickablePath path={currentPath} className="max-w-none shrink-0" />
					</div>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="size-9 shrink-0"
								onClick={handleChange}
								disabled={selectDirectory.isPending || isSubmitting}
								aria-label="Change location"
							>
								<LuFolderOpen className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Change location</TooltipContent>
					</Tooltip>
				</div>
			) : (
				<div className="flex items-center gap-3">
					<span className="text-sm text-muted-foreground">
						Not set up on {hostName}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setSetupOpen(true)}
						disabled={!hostUrl}
					>
						Set up project…
					</Button>
				</div>
			)}

			<SetupProjectModal
				open={setupOpen}
				onOpenChange={setSetupOpen}
				projectId={projectId}
				projectName={projectName}
				hostUrl={hostUrl}
				hostName={hostName}
				repoCloneUrl={repoCloneUrl}
				isRemoteTarget={isRemoteTarget}
				onChanged={onChanged}
			/>

			<RemotePathPicker
				open={changeBrowseOpen}
				onOpenChange={setChangeBrowseOpen}
				hostUrl={hostUrl}
				hostName={hostName}
				initialPath={currentPath ?? undefined}
				title="Change project location"
				description={`Pick the new project folder on ${hostName}.`}
				confirmLabel="Use this folder"
				onPick={(path) => {
					void proposeRelocate(path);
				}}
			/>

			<AlertDialog
				open={pendingPath !== null}
				onOpenChange={(open) => {
					if (!open && !isSubmitting) setPendingPath(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Relocate project?</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-3 text-sm select-text cursor-text">
								<div>
									<div className="text-muted-foreground text-xs">From</div>
									<div className="font-mono break-all">{currentPath}</div>
								</div>
								<div>
									<div className="text-muted-foreground text-xs">To</div>
									<div className="font-mono break-all">{pendingPath}</div>
								</div>
								<p className="text-muted-foreground">
									Existing worktrees under the old path will be orphaned. You
									can re-import them from the worktrees flow.
								</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isSubmitting}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								handleConfirmRelocate();
							}}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Relocating…" : "Relocate"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
