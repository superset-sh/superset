import type { ExternalApp } from "@superset/local-db";
import { toast } from "@superset/ui/sonner";
import { ArrowUpRightIcon } from "lucide-react";
import {
	APP_OPTIONS,
	type OpenInExternalAppOption,
} from "renderer/components/OpenInExternalDropdown/constants";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useSetPreferredOpenInAppIntent } from "renderer/stores/set-preferred-open-in-app-intent";
import type {
	Command,
	CommandContext,
	CommandProvider,
} from "../../core/types";

async function resolvePath(context: CommandContext): Promise<string | null> {
	if (!context.activeHostUrl) {
		toast.error("Host service is not available");
		return null;
	}
	if (!context.workspace) return null;
	try {
		const workspace = await getHostServiceClientByUrl(
			context.activeHostUrl,
		).workspace.get.query({ id: context.workspace.id });
		if (!workspace?.worktreePath) {
			toast.error("Workspace path is not available");
			return null;
		}
		return workspace.worktreePath;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		toast.error(`Failed to resolve workspace path: ${message}`);
		return null;
	}
}

async function openIn(
	context: CommandContext,
	app: ExternalApp,
): Promise<void> {
	const path = await resolvePath(context);
	if (!path) return;
	const projectId = context.workspace?.projectId;
	try {
		if (app === "finder") {
			await electronTrpcClient.external.openInFinder.mutate(path);
		} else {
			await electronTrpcClient.external.openInApp.mutate({
				path,
				app,
				projectId,
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		toast.error(`Failed to open in ${app}: ${message}`);
	}
}

function findOption(app: ExternalApp): OpenInExternalAppOption | undefined {
	return APP_OPTIONS.find((option) => option.id === app);
}

export const openInProvider: CommandProvider = {
	id: "openIn",
	provide: (context) => {
		if (!context.workspace) return [];
		if (
			context.workspace.hostId &&
			context.workspace.hostId !== context.localMachineId
		) {
			return [];
		}

		const preferredApp = context.workspace.preferredOpenInApp ?? "finder";
		const preferredOption = findOption(preferredApp);

		const submenuChildren: Command[] = APP_OPTIONS.map((option) => ({
			id: `openIn.${option.id}`,
			title: option.label,
			section: "workspace",
			iconUrl: option.darkIcon,
			keywords: ["editor", option.id, option.label],
			run: async (ctx) => {
				if (ctx.workspace?.projectId) {
					useSetPreferredOpenInAppIntent.getState().request({
						projectId: ctx.workspace.projectId,
						app: option.id,
					});
				}
				await openIn(ctx, option.id);
			},
		}));

		const commands: Command[] = [];

		if (preferredOption) {
			commands.push({
				id: `openIn.preferred:${preferredOption.id}`,
				title: `Open in ${preferredOption.label}`,
				section: "workspace",
				iconUrl: preferredOption.darkIcon,
				hotkeyId: "OPEN_IN_APP",
				keywords: ["editor", preferredOption.label],
				run: (ctx) => openIn(ctx, preferredOption.id),
			});
		}

		commands.push({
			id: "openIn.menu",
			title: "Open in…",
			section: "workspace",
			icon: ArrowUpRightIcon,
			keywords: ["editor", "finder", "cursor", "vscode"],
			children: submenuChildren,
		});

		return commands;
	},
};
