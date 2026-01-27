import { useMatchRoute } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { CommandContext } from "../../types";

export function useCommandContext(): CommandContext {
	const matchRoute = useMatchRoute();

	const workspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const settingsMatch = matchRoute({ to: "/settings", fuzzy: true });
	const workspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);

	return {
		workspaceId,
		workspaceName: workspace?.name ?? null,
		workspaceBranch: workspace?.branch ?? null,
		projectId: workspace?.projectId ?? null,
		isInWorkspace: !!workspaceId,
		isInSettings: !!settingsMatch,
	};
}
