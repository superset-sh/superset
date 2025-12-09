import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiMiniCloud, HiMiniXMark } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { trpcClient } from "renderer/lib/trpc-client";
import { useAddCloudTab } from "renderer/stores/tabs";

interface DanglingSandboxItemProps {
	id: string;
	name: string;
	status: string;
	claudeHost?: string;
	websshHost?: string;
}

export function DanglingSandboxItem({
	id,
	name,
	status,
	claudeHost,
	websshHost,
}: DanglingSandboxItemProps) {
	const [isDeleting, setIsDeleting] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const utils = trpc.useUtils();
	const addCloudTab = useAddCloudTab();

	// Get first project to create workspace in
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const createWorkspace = trpc.workspaces.create.useMutation({
		onSuccess: () => {
			utils.workspaces.invalidate();
		},
	});

	const handleClick = async () => {
		if (isCreating || isDeleting) return;

		// Need a project to create workspace
		const project = recentProjects[0];
		if (!project) {
			toast.error("No project available", {
				description: "Open a project first to attach this sandbox",
			});
			return;
		}

		setIsCreating(true);
		const toastId = toast.loading("Creating workspace for sandbox...");

		try {
			// Create a workspace
			const result = await createWorkspace.mutateAsync({
				projectId: project.id,
				name: name,
			});

			const worktreeId = result.workspace.worktreeId;

			// Link sandbox to worktree
			await trpcClient.cloud.setWorktreeSandbox.mutate({
				worktreeId,
				cloudSandbox: {
					id,
					name,
					status: status as "creating" | "running" | "stopped" | "error",
					claudeHost,
					websshHost,
					createdAt: new Date().toISOString(),
				},
			});

			// Open cloud split tab with Agent + SSH
			if (claudeHost && websshHost) {
				const agentUrl = claudeHost.startsWith("http")
					? claudeHost
					: `https://${claudeHost}`;
				const sshUrl = websshHost.startsWith("http")
					? `${websshHost}/?hostname=localhost&username=user`
					: `https://${websshHost}/?hostname=localhost&username=user`;
				addCloudTab(result.workspace.id, agentUrl, sshUrl);
			}

			// Invalidate dangling sandboxes query since this one is now linked
			await utils.workspaces.getDanglingSandboxes.invalidate();

			toast.success("Workspace created", { id: toastId });
		} catch (error) {
			toast.error("Failed to create workspace", {
				id: toastId,
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		} finally {
			setIsCreating(false);
		}
	};

	const handleKill = async (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsDeleting(true);
		try {
			const result = await trpcClient.cloud.deleteSandbox.mutate({
				sandboxId: id,
			});

			if (result.success) {
				toast.success("Sandbox deleted");
				await utils.workspaces.getDanglingSandboxes.invalidate();
			} else {
				toast.error("Failed to delete sandbox", {
					description: result.error,
				});
			}
		} catch (error) {
			toast.error("Failed to delete sandbox", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		} finally {
			setIsDeleting(false);
		}
	};

	const isStopped = status === "stopped";

	return (
		<div className="group relative flex items-center shrink-0 h-[80%] px-2 gap-1 rounded-t-md bg-muted/50 text-muted-foreground opacity-60 hover:opacity-100 hover:bg-muted transition-all">
			<button
				type="button"
				onClick={handleClick}
				disabled={isCreating || isDeleting}
				className="flex items-center gap-1 cursor-pointer"
			>
				<HiMiniCloud
					className={`size-3 ${isStopped ? "text-yellow-500" : "text-blue-400"}`}
				/>
				<span className="text-xs whitespace-nowrap truncate max-w-[80px]">
					{name}
				</span>
			</button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={handleKill}
				disabled={isDeleting}
				className="size-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20"
				aria-label="Kill sandbox"
			>
				<HiMiniXMark className="size-4" />
			</Button>
		</div>
	);
}
