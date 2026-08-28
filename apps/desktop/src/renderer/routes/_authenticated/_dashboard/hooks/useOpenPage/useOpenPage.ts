import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLastActiveV2Workspace } from "renderer/stores/last-active-v2-workspace";
import { usePagePaneIntent } from "renderer/stores/page-pane-intent";

export interface OpenPageTarget {
	id?: string;
	slug: string;
	title?: string;
}

export interface OpenPageOptions {
	inPane?: boolean;
}

export type OpenPage = (
	page: OpenPageTarget,
	options?: OpenPageOptions,
) => void;

export function isPaneModifier(
	event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
): boolean {
	return event.metaKey || event.ctrlKey;
}

export function useOpenPage(): OpenPage {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { workspaces } = useHostWorkspaces();
	const lastActiveWorkspaceId = useLastActiveV2Workspace((s) => s.workspaceId);

	const routeMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const activeWorkspaceId =
		routeMatch === false ? null : routeMatch.workspaceId;

	return useCallback(
		(page, options) => {
			if (options?.inPane) {
				const candidate = activeWorkspaceId ?? lastActiveWorkspaceId;
				const targetWorkspaceId =
					candidate && workspaces.some((w) => w.id === candidate)
						? candidate
						: null;
				if (targetWorkspaceId) {
					usePagePaneIntent.getState().request({
						workspaceId: targetWorkspaceId,
						pageId: page.id,
						slug: page.slug,
						title: page.title,
					});
					navigate({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId: targetWorkspaceId },
					});
					return;
				}
			}
			navigate({ to: "/pages/$slug", params: { slug: page.slug } });
		},
		[navigate, activeWorkspaceId, lastActiveWorkspaceId, workspaces],
	);
}
