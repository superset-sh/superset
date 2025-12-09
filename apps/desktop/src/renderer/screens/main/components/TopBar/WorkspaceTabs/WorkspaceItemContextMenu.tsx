import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { toast } from "@superset/ui/sonner";
import { type ReactNode, useState } from "react";
import { HiMiniCloud, HiMiniTrash } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { trpcClient } from "renderer/lib/trpc-client";
import { useAddCloudTab } from "renderer/stores/tabs";
import { WorkspaceHoverCardContent } from "./WorkspaceHoverCard";

interface WorkspaceItemContextMenuProps {
	children: ReactNode;
	workspaceId: string;
	worktreeId: string;
	worktreePath: string;
	workspaceAlias?: string;
	onRename: () => void;
}

export function WorkspaceItemContextMenu({
	children,
	workspaceId,
	worktreeId,
	worktreePath,
	workspaceAlias,
	onRename,
}: WorkspaceItemContextMenuProps) {
	const openInFinder = trpc.external.openInFinder.useMutation();
	const addCloudTab = useAddCloudTab();
	const [isHandingOff, setIsHandingOff] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	// Query cloud status for this worktree
	const { data: cloudStatus } = trpc.cloud.getWorktreeCloudStatus.useQuery(
		{ worktreeId },
		{ refetchInterval: 30000 },
	);
	const utils = trpc.useUtils();

	const handleOpenInFinder = () => {
		if (worktreePath) {
			openInFinder.mutate(worktreePath);
		}
	};

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

	const handleHandoffToCloud = async () => {
		if (isHandingOff) return;
		setIsHandingOff(true);

		const toastId = toast.loading("Handing off to cloud...");

		try {
			const sandboxName = generateSandboxName();
			const result = await trpcClient.cloud.handoffToCloud.mutate({
				name: sandboxName,
				worktreeId,
				taskDescription: "Handoff from local workspace",
			});

			if (!result.success) {
				// Handle specific error codes
				if ("code" in result && result.code === "DIRTY_WORKTREE") {
					toast.error("Uncommitted changes", {
						id: toastId,
						description:
							"Please commit or stash your changes before handing off to cloud.",
					});
				} else if ("code" in result && result.code === "UNPUSHED_COMMITS") {
					toast.error("Unpushed commits", {
						id: toastId,
						description:
							"Please push your commits before handing off to cloud.",
					});
				} else if ("code" in result && result.code === "PUSH_FAILED") {
					toast.error("Failed to push branch", {
						id: toastId,
						description: result.error,
					});
				} else {
					toast.error("Handoff failed", {
						id: toastId,
						description: result.error,
					});
				}
				return;
			}

			const sandbox = result.sandbox;

			// Save sandbox to worktree
			if (sandbox) {
				await trpcClient.cloud.setWorktreeSandbox.mutate({
					worktreeId,
					cloudSandbox: sandbox,
				});
			}

			// Add cloud split tab with Agent (left) + SSH (right)
			if (sandbox?.claudeHost && sandbox?.websshHost) {
				const agentUrl = sandbox.claudeHost.startsWith("http")
					? sandbox.claudeHost
					: `https://${sandbox.claudeHost}`;

				const sshBaseUrl = sandbox.websshHost.startsWith("http")
					? sandbox.websshHost
					: `https://${sandbox.websshHost}`;
				const sshUrl = `${sshBaseUrl}/?hostname=localhost&username=user`;

				addCloudTab(workspaceId, agentUrl, sshUrl);
			}

			toast.success("Handed off to cloud", { id: toastId });
		} catch (error) {
			console.error("Error handing off to cloud:", error);
			toast.error("Handoff failed", {
				id: toastId,
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		} finally {
			setIsHandingOff(false);
		}
	};

	const handleDeleteCloudSandbox = async () => {
		if (isDeleting || !cloudStatus?.hasCloud || !cloudStatus.sandboxId) return;
		setIsDeleting(true);

		const toastId = toast.loading("Deleting cloud sandbox...");

		try {
			const result = await trpcClient.cloud.deleteSandbox.mutate({
				sandboxId: cloudStatus.sandboxId,
			});

			if (!result.success) {
				toast.error("Failed to delete sandbox", {
					id: toastId,
					description: result.error,
				});
				return;
			}

			// Clear sandbox from worktree
			await trpcClient.cloud.setWorktreeSandbox.mutate({
				worktreeId,
				cloudSandbox: null,
			});

			// Invalidate cloud status query
			await utils.cloud.getWorktreeCloudStatus.invalidate({ worktreeId });

			toast.success("Cloud sandbox deleted", { id: toastId });
		} catch (error) {
			console.error("Error deleting cloud sandbox:", error);
			toast.error("Failed to delete sandbox", {
				id: toastId,
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<HoverCard openDelay={400} closeDelay={100}>
			<ContextMenu>
				<HoverCardTrigger asChild>
					<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				</HoverCardTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
					<ContextMenuSeparator />
					{cloudStatus?.hasCloud ? (
						<ContextMenuItem
							onSelect={handleDeleteCloudSandbox}
							disabled={isDeleting}
							className="text-red-500 focus:text-red-500"
						>
							<HiMiniTrash className="size-4 mr-2" />
							Delete Cloud Sandbox
						</ContextMenuItem>
					) : (
						<ContextMenuItem
							onSelect={handleHandoffToCloud}
							disabled={isHandingOff}
						>
							<HiMiniCloud className="size-4 mr-2 text-blue-400" />
							Handoff to Cloud
						</ContextMenuItem>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={handleOpenInFinder}>
						Open in Finder
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<HoverCardContent side="bottom" align="start" className="w-72">
				<WorkspaceHoverCardContent
					workspaceId={workspaceId}
					workspaceAlias={workspaceAlias}
				/>
			</HoverCardContent>
		</HoverCard>
	);
}
