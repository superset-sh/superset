import { msg } from "@lingui/core/macro";
import {
	ArchiveIcon,
	FileIcon,
	LinkIcon,
	PlusIcon,
	Trash2Icon,
	ZapIcon,
} from "lucide-react";
import { useQuickOpenStore } from "renderer/commandPalette/ui/QuickOpen/quickOpenStore";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";
import { useQuickCreateWorkspaceIntent } from "renderer/stores/quick-create-workspace-intent";
import { useRemoveFromSidebarIntent } from "renderer/stores/remove-workspace-from-sidebar-intent";
import type { Command, CommandProvider } from "../../core/types";
import { LinkTaskFrame } from "../../ui/LinkTask/LinkTaskFrame";

export const workspaceProvider: CommandProvider = {
	id: "workspace",
	provide: (context) => {
		// Not gated on context.workspace — quick-create should work from any
		// v2 dashboard view (e.g. the workspaces list), not just an open one.
		const quickCreate: Command = {
			id: "workspace.quickCreate",
			title: msg({
				message: "Quick create workspace",
			}),
			section: "workspace",
			icon: ZapIcon,
			hotkeyId: "QUICK_CREATE_WORKSPACE",
			keywords: ["new", "fast"],
			when: (ctx) => ctx.isV2CloudEnabled,
			run: (ctx) =>
				useQuickCreateWorkspaceIntent
					.getState()
					.request(ctx.workspace?.projectId ?? null),
		};

		if (!context.workspace) return [quickCreate];
		const workspace = context.workspace;
		const isMain = workspace.workspaceType === "main";

		const commands: Command[] = [
			{
				id: "workspace.new",
				title: msg({
					message: "New workspace",
				}),
				section: "workspace",
				icon: PlusIcon,
				hotkeyId: "NEW_WORKSPACE",
				run: () =>
					useNewWorkspaceModalStore.getState().openModal(workspace.projectId),
			},
			quickCreate,
			{
				id: "files.quickOpen",
				title: msg({
					message: "Search files",
				}),
				section: "workspace",
				icon: FileIcon,
				keywords: ["file picker", "quick open"],
				hotkeyId: "QUICK_OPEN",
				run: () =>
					useQuickOpenStore.getState().openFor({
						workspaceId: workspace.id,
					}),
			},
			{
				id: "workspace.linkTask",
				title: msg({
					message: "Link task",
				}),
				section: "workspace",
				icon: LinkIcon,
				keywords: ["issue", "linear"],
				renderFrame: () => <LinkTaskFrame workspaceId={workspace.id} />,
			},
		];

		if (workspace.projectId) {
			commands.push({
				id: `workspace.removeFromSidebar:${workspace.id}`,
				title: msg({
					message: "Remove from sidebar",
				}),
				section: "workspace",
				icon: ArchiveIcon,
				keywords: ["hide"],
				run: () =>
					useRemoveFromSidebarIntent.getState().request({
						workspaceId: workspace.id,
						workspaceName: workspace.name,
						projectId: workspace.projectId ?? "",
						isMain,
					}),
			});
		}

		if (!isMain) {
			commands.push({
				id: `workspace.delete:${workspace.id}`,
				title: msg({
					message: "Delete workspace",
				}),
				section: "workspace",
				icon: Trash2Icon,
				keywords: ["archive", "remove", "close"],
				hotkeyId: "CLOSE_WORKSPACE",
				run: () =>
					useDeleteWorkspaceIntent.getState().request({
						workspaceId: workspace.id,
						workspaceName: workspace.name,
					}),
			});
		}

		return commands;
	},
};
