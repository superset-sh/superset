import { workspaceTrpc } from "@superset/workspace-client";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import {
	type ModifierEvent,
	useInlineFilePolicy,
} from "renderer/lib/clickPolicy";
import { TerminalLinkResolver } from "renderer/lib/terminal/links/link-resolver";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";

interface MarkdownFileLinkContextValue {
	hint: string;
	open: (path: string, event: ModifierEvent) => Promise<void>;
}

const MarkdownFileLinkContext =
	createContext<MarkdownFileLinkContextValue | null>(null);

export function MarkdownFileLinkProvider({
	children,
	onOpenFile,
	workspaceId,
}: {
	children: ReactNode;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	workspaceId: string;
}) {
	const filePolicy = useInlineFilePolicy();
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const statPath = workspaceTrpc.filesystem.statPath.useMutation();
	const resolver = useMemo(
		() =>
			new TerminalLinkResolver(async (path) => {
				try {
					return await statPath.mutateAsync({ workspaceId, path });
				} catch {
					return null;
				}
			}),
		[statPath.mutateAsync, workspaceId],
	);

	const open = useCallback(
		async (path: string, event: ModifierEvent) => {
			const action = filePolicy.getAction(event);
			if (action === null) return;

			const resolved = await resolver.resolveLink(path);
			if (!resolved || resolved.isDirectory) return;

			if (action === "external") {
				openInExternalEditor(resolved.path);
			} else {
				onOpenFile(resolved.path, action === "newTab");
			}
		},
		[filePolicy, onOpenFile, openInExternalEditor, resolver],
	);

	const value = useMemo(
		() => ({ hint: filePolicy.hint, open }),
		[filePolicy.hint, open],
	);

	return (
		<MarkdownFileLinkContext.Provider value={value}>
			{children}
		</MarkdownFileLinkContext.Provider>
	);
}

export function useMarkdownFileLink(): MarkdownFileLinkContextValue | null {
	return useContext(MarkdownFileLinkContext);
}
