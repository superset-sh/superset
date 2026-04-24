import { workspaceTrpc } from "@superset/workspace-client";
import type { PromptEditorDataSource } from "renderer/components/Chat/ChatInterface/components/TiptapPromptEditor/promptEditorDataSource";

// useFileSearch is a custom hook invoked unconditionally from TiptapPromptEditor's
// render; each TiptapPromptEditor instance binds to one data source for its
// lifetime so hook order is stable.
export function useV2PromptEditorDataSource(
	workspaceId: string,
): PromptEditorDataSource {
	return {
		useFileSearch: ({ query, enabled }) => {
			// biome-ignore lint/correctness/useHookAtTopLevel: called as a custom hook from TiptapPromptEditor
			const { data } = workspaceTrpc.filesystem.searchFiles.useQuery(
				{ workspaceId, query, includeHidden: false, limit: 20 },
				{
					enabled: enabled && !!workspaceId,
					staleTime: 1000,
					placeholderData: (prev) => prev ?? { matches: [] },
				},
			);
			return (
				data?.matches.map((match) => ({
					id: match.absolutePath,
					name: match.name,
					relativePath: match.relativePath,
				})) ?? []
			);
		},
		useSlashPreview: () => {
			// Host service previewSlashCommand is a session-scoped stub today;
			// until it's promoted to a workspace-scoped query, skip the preview
			// popover in v2 rather than fire per-keystroke mutations.
			return null;
		},
	};
}
