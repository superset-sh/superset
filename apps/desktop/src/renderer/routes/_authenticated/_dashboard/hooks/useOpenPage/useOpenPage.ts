import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLastActiveWorkspace } from "renderer/stores/last-active-workspace";
import { usePagePaneIntent } from "renderer/stores/page-pane-intent";

interface OpenPageTarget {
	id?: string;
	slug: string;
	title?: string;
}

interface OpenPageOptions {
	inPane?: boolean;
}

type OpenPage = (page: OpenPageTarget, options?: OpenPageOptions) => void;

export function isPaneModifier(
	event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
): boolean {
	return event.metaKey || event.ctrlKey;
}

export function useOpenPage(): OpenPage {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { workspaces } = useHostWorkspaces();
	const lastActiveWorkspaceId = useLastActiveWorkspace((s) => s.workspaceId);
	const { preferences } = useUserPreferences();

	const routeMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const activeWorkspaceId =
		routeMatch === false ? null : routeMatch.workspaceId;

	return useCallback(
		(page, options) => {
			const inPane = options?.inPane ?? preferences.pageOpenAction === "pane";
			if (inPane) {
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
						to: "/workspace/$workspaceId",
						params: { workspaceId: targetWorkspaceId },
					});
					return;
				}
			}
			navigate({ to: "/pages/$slug", params: { slug: page.slug } });
		},
		[
			navigate,
			activeWorkspaceId,
			lastActiveWorkspaceId,
			workspaces,
			preferences.pageOpenAction,
		],
	);
}
