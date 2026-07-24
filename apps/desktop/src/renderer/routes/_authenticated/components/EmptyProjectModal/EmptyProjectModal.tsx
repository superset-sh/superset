import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { LuFolderOpen, LuLoaderCircle } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import {
	useCreateV1Project,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface EmptyProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: (result: { projectId: string }) => void;
	onError?: (message: string) => void;
}

export function EmptyProjectModal({
	open,
	onOpenChange,
	onSuccess,
	onError,
}: EmptyProjectModalProps) {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const hostService = useLocalHostService();
	const finalizeSetup = useFinalizeProjectSetup();
	const createV1Project = useCreateV1Project();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();

	const [parentDir, setParentDir] = useState("");
	const [name, setName] = useState("");
	const [working, setWorking] = useState(false);

	useEffect(() => {
		if (parentDir || !homeDir) return;
		setParentDir(`${homeDir}/.superset/projects`);
	}, [homeDir, parentDir]);

	const reset = () => {
		setName("");
		setWorking(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const handleBrowse = async () => {
		try {
			const result = await selectDirectory.mutateAsync({
				title: "Select project location",
				defaultPath: parentDir || undefined,
			});
			if (!result.canceled && result.path) {
				setParentDir(result.path);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		}
	};

	const createProject = async () => {
		const trimmedName = name.trim();
		const trimmedParent = parentDir.trim();
		if (!trimmedName) {
			toast.error("Please enter a project name");
			return;
		}
		if (!trimmedParent) {
			toast.error("Please select a project location");
			return;
		}

		setWorking(true);
		try {
			if (!isV2CloudEnabled) {
				const projectId = await createV1Project.createEmpty({
					name: trimmedName,
					parentDir: trimmedParent,
					onError: (message) => {
						if (onError) {
							onError(message);
						} else {
							toast.error("Could not create project", {
								description: message,
							});
						}
					},
				});
				if (!projectId) return;
				onSuccess?.({ projectId });
				reset();
				onOpenChange(false);
				return;
			}

			const activeHostUrl = await hostService.waitForHostReady();
			if (!activeHostUrl) {
				showHostServiceUnavailableToast(hostService, {
					action: "create the project",
				});
				return;
			}

			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.create.mutate({
				name: trimmedName,
				mode: { kind: "empty", parentDir: trimmedParent },
			});
			finalizeSetup(activeHostUrl, result);
			onSuccess?.({ projectId: result.projectId });
			reset();
			onOpenChange(false);
		} catch (err) {
			const raw = err instanceof Error ? err.message : String(err);
			const isLeakedSql = raw.startsWith("Failed query:");
			if (isLeakedSql) console.error("[EmptyProjectModal] create failed", err);
			const message = isLeakedSql
				? "Could not create project. Please try a different name or check the logs."
				: raw;
			if (onError) {
				onError(message);
			} else {
				toast.error("Could not create project", { description: message });
			}
		} finally {
			setWorking(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent className="max-w-[420px]">
				<DialogHeader>
					<DialogTitle>Create a new project</DialogTitle>
					<DialogDescription>
						Create a blank folder and initialize it as a Git repository.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="empty-project-name" className="text-xs">
							Project name
						</Label>
						<Input
							id="empty-project-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="my-project"
							disabled={working}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !working) {
									void createProject();
								}
							}}
							autoFocus
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="empty-project-path" className="text-xs">
							Location
						</Label>
						<div className="flex gap-1.5">
							<Input
								id="empty-project-path"
								value={parentDir}
								onChange={(event) => setParentDir(event.target.value)}
								disabled={working}
								className="flex-1 font-mono text-xs"
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={handleBrowse}
								disabled={working || selectDirectory.isPending}
								className="shrink-0"
								aria-label="Browse for directory"
							>
								<LuFolderOpen className="size-4" />
							</Button>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => handleOpenChange(false)}
						disabled={working}
					>
						Cancel
					</Button>
					<Button
						onClick={() => void createProject()}
						disabled={working || !name.trim() || !parentDir.trim()}
					>
						{working ? (
							<>
								<LuLoaderCircle className="size-4 animate-spin" />
								Creating…
							</>
						) : (
							"Create project"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
