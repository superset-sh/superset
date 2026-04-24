import { chatServiceTrpc } from "@superset/chat/client";
import type { PromptEditorDataSource } from "./promptEditorDataSource";

// The methods below are custom hooks invoked unconditionally from
// TiptapPromptEditor's render; each TiptapPromptEditor instance binds to one
// data source for its lifetime so hook order is stable.
export function useV1PromptEditorDataSource(
	cwd: string,
): PromptEditorDataSource {
	return {
		useFileSearch: ({ query, enabled }) => {
			// biome-ignore lint/correctness/useHookAtTopLevel: called as a custom hook from TiptapPromptEditor
			const { data } = chatServiceTrpc.workspace.searchFiles.useQuery(
				{ rootPath: cwd, query, includeHidden: false, limit: 20 },
				{
					enabled: enabled && !!cwd,
					staleTime: 1000,
					placeholderData: (prev) => prev ?? [],
				},
			);
			return data ?? [];
		},
		useSlashPreview: ({ text, enabled }) => {
			// biome-ignore lint/correctness/useHookAtTopLevel: called as a custom hook from SlashCommandPreviewPopover
			const { data } = chatServiceTrpc.workspace.previewSlashCommand.useQuery(
				{ cwd, text },
				{
					enabled: enabled && !!cwd,
					staleTime: 250,
					placeholderData: (previous) => previous,
				},
			);
			return data ?? null;
		},
	};
}
