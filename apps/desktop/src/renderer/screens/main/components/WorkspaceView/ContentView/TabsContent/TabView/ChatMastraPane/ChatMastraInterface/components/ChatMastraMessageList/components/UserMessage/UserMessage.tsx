import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import {
	MessageAction,
	MessageActions,
} from "@superset/ui/ai-elements/message";
import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import {
	CheckIcon,
	CopyIcon,
	PencilLineIcon,
	RotateCcwIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { normalizeWorkspaceFilePath } from "../../../../../../ChatPane/ChatInterface/utils/file-paths";
import type { UserMessageActionPayload } from "../../ChatMastraMessageList.types";
import { AttachmentChip } from "../AttachmentChip";
import { getUserMessageDraft } from "./utils/getUserMessageDraft";
import { parseUserMentions } from "./utils/parseUserMentions";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraMessagePart = MastraMessage["content"][number];

interface UserMessageProps {
	message: MastraMessage;
	workspaceId: string;
	workspaceCwd?: string;
	onResend: (payload: UserMessageActionPayload) => Promise<void>;
	resendDisabled?: boolean;
}

export function UserMessage({
	message,
	workspaceId,
	workspaceCwd,
	onResend,
	resendDisabled = false,
}: UserMessageProps) {
	const { attachments, textInput } = usePromptInputController();
	const addFileViewerPane = useTabsStore((store) => store.addFileViewerPane);
	const draft = getUserMessageDraft(message);
	const fullText = draft.text;
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
	const focusComposer = useCallback(() => {
		requestAnimationFrame(() => {
			const textarea = document.querySelector<HTMLTextAreaElement>(
				"[data-slot=input-group-control]",
			);
			if (!textarea) return;
			textarea.focus();
			const nextCursorPosition = textarea.value.length;
			textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
		});
	}, []);
	const handleEdit = useCallback(() => {
		textInput.setInput(draft.text);
		attachments.setFiles(draft.files);
		focusComposer();
	}, [attachments, draft.files, draft.text, focusComposer, textInput]);
	const handleResend = useCallback(() => {
		const resendPayload: UserMessageActionPayload = {
			content: draft.text,
			...(draft.files.length > 0
				? {
						files: draft.files.map((file) => ({
							data: file.url,
							mediaType: file.mediaType,
							filename: file.filename,
							uploaded: false as const,
						})),
					}
				: {}),
		};
		if (!resendPayload.content && !resendPayload.files?.length) {
			return;
		}

		void onResend(resendPayload).catch((error) => {
			console.debug("[UserMessage] resend failed", error);
		});
	}, [draft.files, draft.text, onResend]);
	const showActions = Boolean(fullText || draft.files.length > 0);

	return (
		<div
			className="group/msg relative flex flex-col items-end gap-2"
			data-chat-user-message="true"
			data-message-id={message.id}
		>
			{showActions ? (
				<div className="absolute -top-3 right-0 z-10 opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">
					<MessageActions className="rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur-xs">
						<MessageAction
							className="size-7 text-muted-foreground hover:text-foreground"
							label="Resend message"
							onClick={handleResend}
							tooltip="Resend"
							disabled={resendDisabled}
						>
							<RotateCcwIcon className="size-3.5" />
						</MessageAction>
						<MessageAction
							className="size-7 text-muted-foreground hover:text-foreground"
							label="Edit message"
							onClick={handleEdit}
							tooltip="Edit"
						>
							<PencilLineIcon className="size-3.5" />
						</MessageAction>
						{fullText ? (
							<MessageAction
								className="size-7 text-muted-foreground hover:text-foreground"
								label={copied ? "Copied" : "Copy message"}
								onClick={handleCopy}
								tooltip={copied ? "Copied" : "Copy"}
							>
								{copied ? (
									<CheckIcon className="size-3.5" />
								) : (
									<CopyIcon className="size-3.5" />
								)}
							</MessageAction>
						) : null}
					</MessageActions>
				</div>
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
