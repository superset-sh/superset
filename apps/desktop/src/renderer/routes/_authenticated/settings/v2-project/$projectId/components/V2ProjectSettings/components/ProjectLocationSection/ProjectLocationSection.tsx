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
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { ClickablePath } from "../../../../../../components/ClickablePath";

interface BackfillConflict {
	id: string;
	name: string;
}

interface ProjectLocationSectionProps {
	projectId: string;
	currentPath: string | null;
	repoCloneUrl: string | null;
	onChanged?: () => void;
}

export function ProjectLocationSection({
	projectId,
	currentPath,
	repoCloneUrl,
	onChanged,
}: ProjectLocationSectionProps) {
	const { activeHostUrl, machineId } = useLocalHostService();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const navigate = useNavigate();
	const collections = useCollections();
	const { ensureProjectInSidebar, ensureWorkspaceInSidebar } =
		useDashboardSidebarState();

	const { data: hostRows } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) => eq(hosts.machineId, machineId ?? ""))
				.select(({ hosts }) => ({
					name: hosts.name,
					isOnline: hosts.isOnline,
				})),
		[collections, machineId],
	);
	const hostLabel = hostRows?.[0]?.name ?? "This device";

	const [pendingPath, setPendingPath] = useState<string | null>(null);
	const [conflict, setConflict] = useState<BackfillConflict | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const runSetup = async (repoPath: string, allowRelocate: boolean) => {
		if (!activeHostUrl) {
			toast.error("Host service not available");
			return false;
		}
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.setup.mutate({
				projectId,
				mode: { kind: "import", repoPath, allowRelocate },
			});
			toast.success(
				allowRelocate
					? `Project relocated to ${result.repoPath}`
					: `Project set up at ${result.repoPath}`,
			);
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			return true;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
			return false;
		}
	};

	const runClone = async (parentDir: string) => {
		if (!activeHostUrl) {
			toast.error("Host service not available");
			return false;
		}
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.setup.mutate({
				projectId,
				mode: { kind: "clone", parentDir },
			});
			toast.success(`Cloned to ${result.repoPath}`);
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			return true;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
			return false;
		}
	};

	const pickPath = async (title: string) => {
		if (!activeHostUrl) {
			toast.error("Host service not available");
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

	const handleImport = async () => {
		const path = await pickPath("Select project location");
		if (!path) return;
		if (!activeHostUrl) {
			toast.error("Host service not available");
			return;
		}
		setIsSubmitting(true);
		let keepSubmitting = false;
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const precheck = await client.project.findBackfillConflict.query({
				projectId,
				repoPath: path,
			});
			if (precheck.conflict) {
				setConflict(precheck.conflict);
				keepSubmitting = true;
				return;
			}
			await runSetup(path, false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		} finally {
			if (!keepSubmitting) setIsSubmitting(false);
		}
	};

	const handleClone = async () => {
		const parentDir = await pickPath("Select parent directory to clone into");
		if (!parentDir) return;
		setIsSubmitting(true);
		try {
			await runClone(parentDir);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleChange = async () => {
		const path = await pickPath("Select new project location");
		if (!path) return;
		if (path === currentPath) {
			toast.info("Project is already at that location");
			return;
		}
		if (!activeHostUrl) {
			toast.error("Host service not available");
			return;
		}
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const precheck = await client.project.findBackfillConflict.query({
				projectId,
				repoPath: path,
			});
			if (precheck.conflict) {
				setConflict(precheck.conflict);
				return;
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
			return;
		}
		setPendingPath(path);
	};

	const handleConfirmRelocate = async () => {
		if (!pendingPath) return;
		setIsSubmitting(true);
		const ok = await runSetup(pendingPath, true);
		setIsSubmitting(false);
		if (ok) setPendingPath(null);
	};

	return (
		<>
			<div className="flex items-center gap-4">
				<div className="w-32 shrink-0 text-sm font-medium truncate">
					{hostLabel}
				</div>
				<div className="flex-1 min-w-0">
					{currentPath ? (
						<ClickablePath path={currentPath} />
					) : (
						<span className="text-sm text-muted-foreground">
							Not set up on this host
						</span>
					)}
				</div>
				{currentPath ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleChange}
						disabled={selectDirectory.isPending || isSubmitting}
					>
						Change location…
					</Button>
				) : (
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleClone}
							disabled={
								!repoCloneUrl || selectDirectory.isPending || isSubmitting
							}
							title={
								repoCloneUrl
									? undefined
									: "Link a GitHub repository first to enable cloning"
							}
						>
							Clone here…
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleImport}
							disabled={selectDirectory.isPending || isSubmitting}
						>
							Import existing…
						</Button>
					</div>
				)}
			</div>

			<AlertDialog
				open={conflict !== null}
				onOpenChange={(open) => {
					if (!open) {
						setConflict(null);
						setIsSubmitting(false);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Repository already linked</AlertDialogTitle>
						<AlertDialogDescription>
							This repository is already linked to project "
							{conflict?.name ?? ""}" in this organization. Open that project to
							set it up on this device.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								if (!conflict) return;
								const target = conflict;
								setConflict(null);
								setIsSubmitting(false);
								navigate({
									to: "/settings/projects/$projectId",
									params: { projectId: target.id },
								});
							}}
						>
							Open project
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

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
							<div className="space-y-3 text-sm">
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
