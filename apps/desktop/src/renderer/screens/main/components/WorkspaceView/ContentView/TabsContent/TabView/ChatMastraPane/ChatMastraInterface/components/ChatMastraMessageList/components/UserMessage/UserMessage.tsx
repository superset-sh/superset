import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { CheckIcon, CopyIcon, FileIcon, FileTextIcon } from "lucide-react";
import { useCallback, useState } from "react";
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

function AttachmentChip({
	data,
	mediaType,
	filename,
	onClick,
}: {
	data: string;
	mediaType: string;
	filename?: string;
	onClick?: () => void;
}) {
	const isImage = mediaType.startsWith("image/");
	const label = filename || (isImage ? "Image" : "Attachment");

	return (
		<button
			type="button"
			className="flex h-8 items-center gap-1.5 rounded-md border border-foreground/20 bg-background/50 px-1.5 text-sm font-medium transition-colors hover:bg-background"
			onClick={onClick}
		>
			<div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded bg-background">
				{isImage && data ? (
					<img src={data} alt={label} className="size-5 object-cover" />
				) : mediaType === "application/pdf" ? (
					<FileIcon className="size-3 text-muted-foreground" />
				) : (
					<FileTextIcon className="size-3 text-muted-foreground" />
				)}
			</div>
			<span className="max-w-[200px] truncate">{label}</span>
		</button>
	);
}

export function UserMessage({
	message,
	workspaceId,
	workspaceCwd,
}: UserMessageProps) {
	const addFileViewerPane = useTabsStore((store) => store.addFileViewerPane);

	const handleImageClick = useCallback(
		(url: string) => {
			if (!workspaceId) return;
			addFileViewerPane(workspaceId, { filePath: url, isPinned: true });
		},
		[workspaceId, addFileViewerPane],
	);

	const openMentionedFile = useCallback(
		(filePath: string) => {
			addFileViewerPane(workspaceId, { filePath, isPinned: true });
		},
		[addFileViewerPane, workspaceId],
	);

	const attachments: Array<{
		key: string;
		data: string;
		mediaType: string;
		filename?: string;
	}> = [];
	const textParts: Array<{ key: string; text: string }> = [];

	const parts = message.content as Record<string, unknown>[];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		const key = `${message.id}-${i}`;
		if (part.type === "text") {
			textParts.push({ key, text: part.text as string });
		} else if (part.type === "file" || part.type === "image") {
			const mime =
				(part.mediaType as string) ||
				(part.mimeType as string) ||
				"application/octet-stream";
			const data = (part.data as string) || (part.image as string) || "";
			if (data) {
				attachments.push({
					key,
					data,
					mediaType: mime,
					filename: part.filename as string | undefined,
				});
			}
		}
	}

	const fullText = textParts.map((tp) => tp.text).join("\n");
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		if (!fullText) return;
		navigator.clipboard.writeText(fullText);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}, [fullText]);

	const hasMentions = textParts.some((tp) => {
		const segments = parseUserMentions(tp.text);
		return segments.some((s) => s.type === "file-mention");
	});

	return (
		<div
			className="group/msg relative flex flex-col items-end gap-2"
			data-chat-user-message="true"
			data-message-id={message.id}
		>
			{fullText && (
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
					{!copied && <TooltipContent side="top">Copy</TooltipContent>}
				</Tooltip>
			)}
			<div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
				{attachments.length > 0 && (
					<div className="mb-2 flex flex-wrap gap-2">
						{attachments.map((att) => (
							<AttachmentChip
								key={att.key}
								data={att.data}
								mediaType={att.mediaType}
								filename={att.filename}
								onClick={() => handleImageClick(att.data)}
							/>
						))}
					</div>
				)}
				{hasMentions
					? textParts.map(({ key, text }) => {
							const mentionSegments = parseUserMentions(text);
							return (
								<span key={key} className="whitespace-pre-wrap">
									{mentionSegments.map((segment) => {
										if (segment.type === "text") {
											return (
												<span
													key={`${key}-text-${segment.value.slice(0, 20)}`}
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
												key={`${key}-mention-${segment.relativePath}`}
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
								</span>
							);
						})
					: textParts.map((tp) => (
							<span key={tp.key} className="whitespace-pre-wrap">
								{tp.text}
							</span>
						))}
			</div>
		</div>
	);
}
