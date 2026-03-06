import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { normalizeWorkspaceFilePath } from "../../../../../../ChatPane/ChatInterface/utils/file-paths";
import { AttachmentChip } from "../AttachmentChip";
import { parseUserMentions } from "./utils/parseUserMentions";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraMessagePart = MastraMessage["content"][number];

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
	const fullText = message.content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join("\n");
	const [copied, setCopied] = useState(false);

	const openAttachment = useCallback(
		(url: string, filename?: string) => {
			addFileViewerPane(workspaceId, {
				filePath: url,
				isPinned: true,
				...(filename ? { displayName: filename } : {}),
			});
		},
		[addFileViewerPane, workspaceId],
	);
	const openMentionedFile = useCallback(
		(filePath: string) => {
			addFileViewerPane(workspaceId, { filePath, isPinned: true });
		},
		[addFileViewerPane, workspaceId],
	);
	const handleCopy = useCallback(() => {
		if (!fullText) return;
		navigator.clipboard.writeText(fullText).then(
			() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			},
			(error) => {
				console.warn("[UserMessage] clipboard write failed", error);
			},
		);
	}, [fullText]);

	return (
		<div
			className="group/msg relative flex flex-col items-end gap-2"
			data-chat-user-message="true"
			data-message-id={message.id}
		>
			{fullText ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleCopy}
							className="absolute -top-2 right-0 rounded-md border border-border bg-background p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/msg:opacity-100"
						>
							{copied ? (
								<CheckIcon className="size-3.5" />
							) : (
								<CopyIcon className="size-3.5" />
							)}
						</button>
					</TooltipTrigger>
					{!copied ? <TooltipContent side="top">Copy</TooltipContent> : null}
				</Tooltip>
			) : null}
			{message.content.some(
				(part) =>
					part.type === "image" || (part as { type?: string }).type === "file",
			) && (
				<div className="flex max-w-[85%] flex-wrap justify-end gap-2">
					{message.content.map((part: MastraMessagePart, partIndex: number) => {
						const rawPart = part as {
							data?: string;
							filename?: string;
							mediaType?: string;
							mimeType?: string;
							type?: string;
						};
						if (part.type !== "image" && rawPart.type !== "file") {
							return null;
						}

						const data = rawPart.data ?? "";
						const mediaType =
							rawPart.mediaType ??
							rawPart.mimeType ??
							"application/octet-stream";
						if (!data) {
							return null;
						}

						if (
							part.type === "image" &&
							"mimeType" in part &&
							!rawPart.mediaType
						) {
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

						return (
							<AttachmentChip
								key={`${message.id}-${partIndex}`}
								data={data}
								mediaType={mediaType}
								filename={rawPart.filename}
								onClick={() => openAttachment(data, rawPart.filename)}
							/>
						);
					})}
				</div>
			)}
			{message.content.map((part: MastraMessagePart, partIndex: number) => {
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
				return null;
			})}
		</div>
	);
}
