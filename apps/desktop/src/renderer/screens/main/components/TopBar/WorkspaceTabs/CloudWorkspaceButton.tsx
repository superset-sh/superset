import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiMiniCloud, HiMiniFolderOpen } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { TabType, useAddTab } from "renderer/stores";

export interface CloudWorkspaceButtonProps {
	className?: string;
}

export function CloudWorkspaceButton({ className }: CloudWorkspaceButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isCreating, setIsCreating] = useState(false);

	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const openNew = useOpenNew();
	const addTab = useAddTab();

	const generateSandboxName = () => {
		const adjectives = [
			"happy",
			"sleepy",
			"brave",
			"clever",
			"gentle",
			"bright",
			"calm",
			"bold",
			"swift",
			"quiet",
		];
		const nouns = [
			"cat",
			"fox",
			"owl",
			"bear",
			"wolf",
			"deer",
			"hawk",
			"lynx",
			"seal",
			"dove",
		];
		const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
		const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
		const timestamp = Date.now().toString(36);
		return `${randomAdj}-${randomNoun}-${timestamp}`;
	};

	const handleCreateCloudWorkspace = async (projectId: string) => {
		setIsCreating(true);
		setIsOpen(false);

		const toastId = toast.loading("Creating cloud workspace...");

		try {
			// 1. Create local workspace first
			const workspaceResult = await createWorkspace.mutateAsync({ projectId });
			const workspaceId = workspaceResult.workspace.id;
			const worktreeId = workspaceResult.workspace.worktreeId;

			// 2. Create cloud sandbox
			const sandboxName = generateSandboxName();
			const result = await window.ipcRenderer.invoke("cloud-sandbox-create", {
				name: sandboxName,
				projectId,
				taskDescription: `Cloud development workspace`,
			});

			if (!result.success) {
				throw new Error(result.error || "Failed to create cloud sandbox");
			}

			const sandbox = result.sandbox;

			// 3. Save sandbox to worktree
			if (sandbox) {
				await window.ipcRenderer.invoke("worktree-set-cloud-sandbox", {
					worktreeId,
					cloudSandbox: sandbox,
				});
			}

			// 4. Add two webview tabs: Claude chat (7030) and WebSSH (8888)
			if (sandbox?.claudeHost) {
				const claudeUrl = sandbox.claudeHost.startsWith("http")
					? sandbox.claudeHost
					: `https://${sandbox.claudeHost}`;
				addTab(workspaceId, TabType.WebView, {
					url: claudeUrl,
					title: "Cloud Agent",
				});
			}

			if (sandbox?.websshHost) {
				const baseUrl = sandbox.websshHost.startsWith("http")
					? sandbox.websshHost
					: `https://${sandbox.websshHost}`;
				// Pre-fill webssh with localhost connection for user
				const websshUrl = `${baseUrl}/?hostname=localhost&username=user`;
				addTab(workspaceId, TabType.WebView, {
					url: websshUrl,
					title: "Cloud Terminal",
				});
			}

			toast.success("Cloud workspace created", { id: toastId });
		} catch (error) {
			console.error("Error creating cloud workspace:", error);
			toast.error("Failed to create cloud workspace", {
				id: toastId,
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		} finally {
			setIsCreating(false);
		}
	};

	const handleOpenNewProject = async () => {
		try {
			const result = await openNew.mutateAsync(undefined);
			if (!result.canceled && result.project) {
				handleCreateCloudWorkspace(result.project.id);
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger className={className} asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Add new cloud workspace"
					disabled={isCreating}
				>
					<HiMiniCloud className="size-4 text-blue-400" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-80 p-0" align="start">
				<div className="py-2">
					{recentProjects.length > 0 && (
						<div className="px-2 pb-2 border-b">
							<p className="text-xs text-muted-foreground px-2 py-1.5">
								Create Cloud Workspace
							</p>
							{recentProjects.map(
								(project: {
									id: string;
									name: string;
									mainRepoPath: string;
								}) => (
									<button
										type="button"
										key={project.id}
										onClick={() => handleCreateCloudWorkspace(project.id)}
										disabled={isCreating}
										className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
									>
										<div className="font-medium flex items-center gap-2">
											<HiMiniCloud className="size-3 text-blue-400" />
											{project.name}
										</div>
										<div className="text-xs text-muted-foreground truncate">
											{project.mainRepoPath}
										</div>
									</button>
								),
							)}
						</div>
					)}
					<div className="px-2 pt-2">
						<button
							type="button"
							onClick={handleOpenNewProject}
							disabled={openNew.isPending || isCreating}
							className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2"
						>
							<HiMiniFolderOpen className="h-4 w-4" />
							<span>Open New Project...</span>
						</button>
					</div>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
