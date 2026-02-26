import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import { useCallback } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { normalizeWorkspaceFilePath } from "../../../../../../ChatPane/ChatInterface/utils/file-paths";
import { parseUserMentions } from "./utils/parseUserMentions";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];

interface UserMessageProps {
	message: MastraMessage;
	workspaceId: string;
	workspaceCwd?: string;
}

export function UserMessage({
	message,
	workspaceId,
	workspaceCwd,
}: UserMessageProps) {
	const addFileViewerPane = useTabsStore((store) => store.addFileViewerPane);
	const openMentionedFile = useCallback(
		(filePath: string) => {
			addFileViewerPane(workspaceId, { filePath, isPinned: true });
		},
		[addFileViewerPane, workspaceId],
	);

	return (
		<div
			className="flex flex-col items-end gap-2"
			data-chat-user-message="true"
			data-message-id={message.id}
		>
			{message.content.map((part, partIndex) => {
				if (part.type === "text") {
					const mentionSegments = parseUserMentions(part.text);
					return (
						<div
							key={`${message.id}-${partIndex}`}
							className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground whitespace-pre-wrap"
						>
							{mentionSegments.map((segment, segmentIndex) => {
								if (segment.type === "text") {
									return (
										<span
											key={`${message.id}-${partIndex}-${segmentIndex}`}
											className="whitespace-pre-wrap break-words"
										>
											{segment.value}
										</span>
									);
								}

								const normalizedPath = normalizeWorkspaceFilePath({
									filePath: segment.relativePath,
									workspaceRoot: workspaceCwd,
								});
								const canOpen = Boolean(normalizedPath);

								return (
									<button
										type="button"
										key={`${message.id}-${partIndex}-${segmentIndex}`}
										className="mx-0.5 inline-flex items-center gap-0.5 rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary transition-colors hover:bg-primary/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:opacity-60"
										onClick={() => {
											if (!normalizedPath) return;
											openMentionedFile(normalizedPath);
										}}
										disabled={!canOpen}
										aria-label={`Open file ${segment.relativePath}`}
									>
										<span className="font-semibold text-primary">@</span>
										<span className="text-primary/95">
											{segment.relativePath}
										</span>
									</button>
								);
							})}
						</div>
					);
				}
				if (part.type === "image") {
					return (
						<div key={`${message.id}-${partIndex}`} className="max-w-[85%]">
							<img
								src={`data:${part.mimeType};base64,${part.data}`}
								alt="Attached"
								className="max-h-48 rounded-lg object-contain"
							/>
						</div>
					);
				}
				return null;
			})}
		</div>
	);
}
