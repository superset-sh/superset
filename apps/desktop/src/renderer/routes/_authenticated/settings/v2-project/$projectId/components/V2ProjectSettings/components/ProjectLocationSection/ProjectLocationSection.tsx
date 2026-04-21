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
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiOutlineFolderOpen } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { ClickablePath } from "../../../../../../components/ClickablePath";

interface BackfillConflict {
	id: string;
	name: string;
}

interface ProjectLocationSectionProps {
	projectId: string;
	currentPath: string | null;
	onChanged?: () => void;
}

export function ProjectLocationSection({
	projectId,
	currentPath,
	onChanged,
}: ProjectLocationSectionProps) {
	const { activeHostUrl } = useLocalHostService();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const navigate = useNavigate();

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

	const handleSetup = async () => {
		const path = await pickPath("Select project location");
		if (!path) return;
		if (!activeHostUrl) {
			toast.error("Host service not available");
			return;
		}
		setIsSubmitting(true);
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
			await runSetup(path, false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
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
			<div className="pt-3 border-t space-y-3">
				<div>
					<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
						<HiOutlineFolderOpen className="h-4 w-4" />
						Project Location
					</h3>
					<p className="text-xs text-muted-foreground mt-1">
						{currentPath
							? "Where this project lives on disk. Change it if the folder was moved or added at the wrong location."
							: "Point this project at a local clone of the repository to set it up on this device."}
					</p>
				</div>
				<div className="flex items-center justify-between gap-4">
					{currentPath ? (
						<ClickablePath path={currentPath} />
					) : (
						<span className="text-sm text-muted-foreground">
							Not set up on this device
						</span>
					)}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={currentPath ? handleChange : handleSetup}
						disabled={selectDirectory.isPending || isSubmitting}
					>
						{currentPath ? "Change location…" : "Choose folder…"}
					</Button>
				</div>
			</div>

			<AlertDialog
				open={conflict !== null}
				onOpenChange={(open) => {
					if (!open) setConflict(null);
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
