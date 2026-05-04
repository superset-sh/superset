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
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import {
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuLayoutTemplate,
	LuLoaderCircle,
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
	icon: typeof LuGitBranch;
	disabled?: boolean;
}[] = [
	{
		mode: "clone",
		label: "Clone repository",
		icon: LuGitBranch,
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
	const trimmed = url
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:\\]/).filter(Boolean);
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
	const [working, setWorking] = useState(false);

	useEffect(() => {
		if (parentDir || !homeDir) return;
		setParentDir(`${homeDir}/.superset/projects`);
	}, [homeDir, parentDir]);

	const reset = () => {
		setUrl("");
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

	const createFromClone = async () => {
		if (!activeHostUrl) {
			toast.error("Host service not available");
			return;
		}
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
		const name = deriveProjectNameFromUrl(trimmedUrl);
		if (!name) {
			toast.error("Could not derive a project name from the URL or path");
			return;
		}

		setWorking(true);
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
			toast.error("Could not create project", { description: message });
			onError?.(message);
		} finally {
			setWorking(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="gap-0 overflow-hidden rounded-xl p-0 shadow-2xl sm:max-w-md">
				<DialogHeader className="px-5 pt-5 pb-4">
					<DialogTitle className="text-base font-semibold">
						New project
					</DialogTitle>
					<DialogDescription className="sr-only">
						Create a new project by cloning a repository or local path.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 px-5 pb-5">
					<div className="grid grid-cols-3 gap-2">
						{OPTIONS.map((option) => {
							const selected = mode === option.mode;
							const isDisabled = option.disabled || working;
							return (
								<button
									key={option.mode}
									type="button"
									disabled={isDisabled}
									onClick={() => setMode(option.mode)}
									className={cn(
										"flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition-all",
										selected
											? "border-primary/40 bg-primary/5 shadow-sm"
											: "border-border/60 bg-background",
										!isDisabled &&
											!selected &&
											"hover:border-border hover:bg-accent/40",
										isDisabled && "cursor-not-allowed opacity-50",
									)}
								>
									<option.icon
										className={cn(
											"size-5 transition-colors",
											selected ? "text-primary" : "text-muted-foreground",
										)}
									/>
									<div className="flex flex-col items-center gap-0.5 text-xs font-medium leading-tight">
										<span
											className={
												selected ? "text-foreground" : "text-foreground/90"
											}
										>
											{option.label}
										</span>
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

					<div className="flex flex-col gap-1.5">
						<Label
							htmlFor="project-path"
							className="text-xs font-medium text-muted-foreground"
						>
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

					{mode === "clone" && (
						<div className="flex flex-col gap-1.5">
							<Label
								htmlFor="clone-url"
								className="text-xs font-medium text-muted-foreground"
							>
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
					)}
				</div>

				<DialogFooter className="border-t border-border bg-muted/40 px-5 py-3 sm:gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={working}
						className="transition-transform duration-150 active:scale-[0.97]"
					>
						Cancel
					</Button>
					<Button
						onClick={() => void createFromClone()}
						disabled={working || mode !== "clone"}
						className="transition-transform duration-150 active:scale-[0.97]"
					>
						{working ? (
							<>
								<LuLoaderCircle className="size-4 animate-spin" />
								Cloning…
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
