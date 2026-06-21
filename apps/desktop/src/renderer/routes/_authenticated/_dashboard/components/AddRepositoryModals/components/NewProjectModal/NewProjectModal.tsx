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
import {
	getEventBus,
	type ProjectCreateProgressPayload,
} from "@superset/workspace-client";
import { useEffect, useState } from "react";
import { LuFolderOpen, LuLoaderCircle } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface NewProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: (result: { projectId: string }) => void;
	onError?: (message: string) => void;
}

function deriveProjectNameFromUrl(url: string): string {
	const trimmed = url
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:\\]/).filter(Boolean);
	return segments[segments.length - 1] ?? "";
}

function createProgressRequestId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function formatProgressPercent(progress: ProjectCreateProgressPayload | null) {
	return progress?.percent !== null && progress?.percent !== undefined
		? `${Math.round(progress.percent)}%`
		: null;
}

export function NewProjectModal({
	open,
	onOpenChange,
	onSuccess,
	onError,
}: NewProjectModalProps) {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const finalizeSetup = useFinalizeProjectSetup();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();

	const [parentDir, setParentDir] = useState("");
	const [url, setUrl] = useState("");
	const [name, setName] = useState("");
	const [nameTouched, setNameTouched] = useState(false);
	const [working, setWorking] = useState(false);
	const [progress, setProgress] = useState<ProjectCreateProgressPayload | null>(
		null,
	);

	useEffect(() => {
		if (parentDir || !homeDir) return;
		setParentDir(`${homeDir}/.superset/projects`);
	}, [homeDir, parentDir]);

	useEffect(() => {
		if (nameTouched) return;
		setName(deriveProjectNameFromUrl(url));
	}, [url, nameTouched]);

	const reset = () => {
		setUrl("");
		setName("");
		setNameTouched(false);
		setWorking(false);
		setProgress(null);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) {
			onOpenChange(false);
			return;
		}
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

	const createFromClone = async () => {
		const trimmedUrl = url.trim();
		const trimmedParent = parentDir.trim();
		if (!trimmedUrl) {
			toast.error("Please enter a repository URL");
			return;
		}
		if (!trimmedParent) {
			toast.error("Please select a project location");
			return;
		}

		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "clone the repository",
			});
			return;
		}

		const trimmedName = name.trim() || deriveProjectNameFromUrl(trimmedUrl);
		if (!trimmedName) {
			toast.error("Please enter a project name");
			return;
		}

		const progressRequestId = createProgressRequestId();
		const toastId = `project-clone-${progressRequestId}`;
		const initialProgress: ProjectCreateProgressPayload = {
			stage: "queued",
			message: "Preparing clone",
			percent: null,
			occurredAt: Date.now(),
		};
		setWorking(true);
		setProgress(initialProgress);
		toast.loading("Cloning repository", {
			id: toastId,
			description: initialProgress.message,
		});

		const bus = getEventBus(activeHostUrl, () =>
			getHostServiceWsToken(activeHostUrl),
		);
		const removeProgressListener = bus.on(
			"project:create-progress",
			progressRequestId,
			(_requestId, nextProgress) => {
				setProgress(nextProgress);
				toast.loading("Cloning repository", {
					id: toastId,
					description:
						formatProgressPercent(nextProgress) === null
							? nextProgress.message
							: `${nextProgress.message} (${formatProgressPercent(nextProgress)})`,
				});
			},
		);
		const releaseProgressBus = bus.retain();

		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.create.mutate({
				name: trimmedName,
				progressRequestId,
				mode: { kind: "clone", parentDir: trimmedParent, url: trimmedUrl },
			});
			finalizeSetup(activeHostUrl, result);
			toast.success("Project created", {
				id: toastId,
				description: trimmedName,
			});
			onSuccess?.({ projectId: result.projectId });
			reset();
			onOpenChange(false);
		} catch (err) {
			const raw = err instanceof Error ? err.message : String(err);
			// Drizzle / pg errors arrive as "Failed query: insert into ..."
			// which is useless to a user. Hide that envelope in favor of a
			// short generic message; details land in the console for devs.
			const isLeakedSql = raw.startsWith("Failed query:");
			if (isLeakedSql) console.error("[NewProjectModal] create failed", err);
			const message = isLeakedSql
				? "Could not create project. Please try a different name or check the logs."
				: raw;
			setProgress({
				stage: "failed",
				message,
				percent: null,
				occurredAt: Date.now(),
			});
			toast.error("Could not create project", {
				id: toastId,
				description: message,
			});
			onError?.(message);
		} finally {
			removeProgressListener();
			releaseProgressBus();
			setWorking(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent className="max-w-[420px]">
				<DialogHeader>
					<DialogTitle>Clone a repository</DialogTitle>
					<DialogDescription className="sr-only">
						Create a new project by cloning a repository or local path.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="clone-url" className="text-xs">
							Repository URL or path
						</Label>
						<Input
							id="clone-url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://github.com/owner/repo.git or /path/to/repo"
							disabled={working}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !working) {
									void createFromClone();
								}
							}}
							autoFocus
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="project-name" className="text-xs">
							Project name
						</Label>
						<Input
							id="project-name"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								setNameTouched(true);
							}}
							placeholder="my-project"
							disabled={working}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="project-path" className="text-xs">
							Location
						</Label>
						<div className="flex gap-1.5">
							<Input
								id="project-path"
								value={parentDir}
								onChange={(e) => setParentDir(e.target.value)}
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

					{working && progress ? (
						<div
							className="rounded-md border border-border/70 bg-muted/30 px-3 py-2"
							aria-live="polite"
						>
							<div className="flex items-center justify-between gap-3 text-xs">
								<span className="min-w-0 truncate text-muted-foreground">
									{progress.message}
								</span>
								{formatProgressPercent(progress) ? (
									<span className="shrink-0 tabular-nums text-foreground">
										{formatProgressPercent(progress)}
									</span>
								) : null}
							</div>
							<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
								<div
									className={
										progress.percent === null
											? "h-full w-1/3 animate-pulse rounded-full bg-primary"
											: "h-full rounded-full bg-primary transition-[width]"
									}
									style={
										progress.percent === null
											? undefined
											: { width: `${progress.percent}%` }
									}
								/>
							</div>
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => handleOpenChange(false)}
					>
						{working ? "Hide" : "Cancel"}
					</Button>
					<Button onClick={() => void createFromClone()} disabled={working}>
						{working ? (
							<>
								<LuLoaderCircle className="size-4 animate-spin" />
								{formatProgressPercent(progress)
									? `Cloning ${formatProgressPercent(progress)}`
									: "Cloning…"}
							</>
						) : (
							"Clone"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
