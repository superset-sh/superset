import type { RendererContext } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useRef } from "react";
import {
	useTerminalFilePolicy,
	useTerminalFolderPolicy,
	useUrlLinkAction,
} from "renderer/lib/clickPolicy";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useRevealInFinder } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRevealInFinder";
import type {
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	runFileLinkAction,
	runFolderLinkAction,
	runUrlLinkAction,
	type TerminalLinkActionDeps,
} from "../../../../utils/runTerminalLinkAction";
import type { OpenLink } from "../../../ChatSession/providers/ChatPaneActionsProvider";
import { parseFileHref } from "./utils/parseFileHref";

const WEB_URL = /^https?:\/\//i;

export function useOpenChatLink({
	store,
	workspaceId,
	onOpenFile,
	onRevealPath,
	showHint,
}: {
	store: RendererContext<PaneViewerData>["store"];
	workspaceId: string;
	onOpenFile: OpenFile;
	onRevealPath: (path: string, options?: { isDirectory?: boolean }) => void;
	showHint: (clientX: number, clientY: number) => void;
}): OpenLink {
	const filePolicy = useTerminalFilePolicy();
	const folderPolicy = useTerminalFolderPolicy();
	const getUrlAction = useUrlLinkAction("4-tier");
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const revealInFinder = useRevealInFinder(workspaceId);
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const statPath = workspaceTrpc.filesystem.statPath.useMutation();
	const statPathRef = useRef(statPath.mutateAsync);
	statPathRef.current = statPath.mutateAsync;

	const depsRef = useRef<TerminalLinkActionDeps>({
		store,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		revealInFinder,
		worktreePath: undefined,
	});
	depsRef.current = {
		store,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		revealInFinder,
		worktreePath: workspace?.worktreePath ?? undefined,
	};

	return useCallback(
		(href, event) => {
			if (WEB_URL.test(href)) {
				const action = getUrlAction(event, href);
				if (action === null) showHint(event.clientX, event.clientY);
				else runUrlLinkAction(depsRef.current, href, action);
				return true;
			}

			const file = parseFileHref(href);
			if (!file) return false;
			void statPathRef
				.current({ workspaceId, path: file.path })
				.catch(() => null)
				.then((stat) => {
					if (!stat) return;
					if (stat.isDirectory) {
						const intent = folderPolicy.getIntent(event);
						if (intent === null) showHint(event.clientX, event.clientY);
						else
							runFolderLinkAction(depsRef.current, stat.resolvedPath, intent);
						return;
					}
					const action = filePolicy.getAction(event);
					if (action === null) {
						showHint(event.clientX, event.clientY);
						return;
					}
					runFileLinkAction(
						depsRef.current,
						{ path: stat.resolvedPath, row: file.row, col: file.col },
						action,
					);
				});
			return true;
		},
		[workspaceId, getUrlAction, filePolicy, folderPolicy, showHint],
	);
}
