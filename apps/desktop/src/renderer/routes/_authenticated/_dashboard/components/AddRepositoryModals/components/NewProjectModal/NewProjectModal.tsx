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
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import {
	LuFolderOpen,
	LuFolderPlus,
	LuLayoutTemplate,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	type ProjectSetupResult,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

type NewProjectMode = "clone" | "empty" | "template";

interface NewProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: (result: ProjectSetupResult) => void;
	onError?: (message: string) => void;
}

const OPTIONS: {
	mode: NewProjectMode;
	label: string;
	suffix?: string;
	icon: typeof FaGithub;
	disabled?: boolean;
}[] = [
	{
		mode: "clone",
		label: "Clone from GitHub",
		icon: FaGithub,
	},
	{
		mode: "empty",
		label: "Empty",
		suffix: "(coming soon)",
		icon: LuFolderPlus,
		disabled: true,
	},
	{
		mode: "template",
		label: "Template",
		suffix: "(coming soon)",
		icon: LuLayoutTemplate,
		disabled: true,
	},
];

function deriveProjectNameFromUrl(url: string): string {
	const trimmed = url.trim().replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:]/).filter(Boolean);
	return segments[segments.length - 1] ?? "";
}

export function NewProjectModal({
	open,
	onOpenChange,
	onSuccess,
	onError,
}: NewProjectModalProps) {
	const { activeHostUrl } = useLocalHostService();
	const finalizeSetup = useFinalizeProjectSetup();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();

	const [mode, setMode] = useState<NewProjectMode>("clone");
	const [parentDir, setParentDir] = useState("");
	const [url, setUrl] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [working, setWorking] = useState(false);

	useEffect(() => {
		if (parentDir || !homeDir) return;
		setParentDir(`${homeDir}/.superset/projects`);
	}, [homeDir, parentDir]);

	const reset = () => {
		setUrl("");
		setError(null);
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
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	const createFromClone = async () => {
		if (!activeHostUrl) {
			setError("Host service not available");
			return;
		}
		const trimmedUrl = url.trim();
		const trimmedParent = parentDir.trim();
		if (!trimmedUrl) {
			setError("Please enter a repository URL");
			return;
		}
		if (!trimmedParent) {
			setError("Please select a project location");
			return;
		}
		const name = deriveProjectNameFromUrl(trimmedUrl);
		if (!name) {
			setError("Could not derive a project name from the URL");
			return;
		}

		setWorking(true);
		setError(null);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.create.mutate({
				name,
				mode: { kind: "clone", parentDir: trimmedParent, url: trimmedUrl },
			});
			finalizeSetup(activeHostUrl, result);
			onSuccess?.(result);
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
			setError(message);
			onError?.(message);
		} finally {
			setWorking(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>New project</DialogTitle>
					<DialogDescription className="sr-only">
						Create a new project by cloning a repository.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="project-path"
							className="text-xs font-medium text-muted-foreground"
						>
							Location
						</label>
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

					<div className="grid grid-cols-3 gap-2">
						{OPTIONS.map((option) => {
							const selected = mode === option.mode;
							const isDisabled = option.disabled || working;
							return (
								<button
									key={option.mode}
									type="button"
									disabled={isDisabled}
									onClick={() => {
										setMode(option.mode);
										setError(null);
									}}
									className={cn(
										"flex flex-col items-center gap-2 rounded-lg border px-3 py-4 text-center transition-colors",
										selected
											? "border-transparent bg-primary/5"
											: "border-border/60",
										!isDisabled && !selected && "hover:bg-accent/30",
										isDisabled && "opacity-50 cursor-not-allowed",
									)}
								>
									<option.icon
										className={cn(
											"size-5",
											selected ? "text-primary" : "text-muted-foreground",
										)}
									/>
									<div className="flex flex-col items-center gap-0.5 text-xs font-medium text-foreground leading-tight">
										<span>{option.label}</span>
										{option.suffix && (
											<span className="text-[11px] font-normal text-muted-foreground">
												{option.suffix}
											</span>
										)}
									</div>
								</button>
							);
						})}
					</div>

					{mode === "clone" && (
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="clone-url"
								className="text-xs font-medium text-muted-foreground"
							>
								Repository URL
							</label>
							<Input
								id="clone-url"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								placeholder="https://github.com/owner/repo.git"
								disabled={working}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !working) {
										void createFromClone();
									}
								}}
								autoFocus
							/>
						</div>
					)}

					{error && (
						<div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
							<span className="flex-1 text-xs text-destructive">{error}</span>
							<button
								type="button"
								onClick={() => setError(null)}
								className="shrink-0 rounded p-0.5 text-destructive/70 hover:text-destructive transition-colors"
								aria-label="Dismiss error"
							>
								<LuX className="size-3.5" />
							</button>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={working}
					>
						Cancel
					</Button>
					<Button
						onClick={() => void createFromClone()}
						disabled={working || mode !== "clone"}
					>
						{working ? "Cloning…" : "Clone"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
