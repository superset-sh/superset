import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import {
	MessageAction,
	MessageActions,
} from "@superset/ui/ai-elements/message";
import {
	CheckIcon,
	CopyIcon,
	PencilLineIcon,
	RotateCcwIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { normalizeWorkspaceFilePath } from "../../../../../../ChatPane/ChatInterface/utils/file-paths";
import type {
	UserMessageActionPayload,
	UserMessageRestartRequest,
} from "../../ChatMastraMessageList.types";
import { AttachmentChip } from "../AttachmentChip";
import { UserMessageEditor } from "./components/UserMessageEditor";
import { getUserMessageDraft } from "./utils/getUserMessageDraft";
import { parseUserMentions } from "./utils/parseUserMentions";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraMessagePart = MastraMessage["content"][number];

interface UserMessageProps {
	message: MastraMessage;
	anchorMessageId: string | null;
	workspaceId: string;
	workspaceCwd?: string;
	isEditing: boolean;
	isSubmitting: boolean;
	onStartEdit: (messageId: string) => void;
	onCancelEdit: () => void;
	onSubmitEdit: (request: UserMessageRestartRequest) => Promise<void>;
	onRestart: (request: UserMessageRestartRequest) => Promise<void>;
	actionDisabled?: boolean;
}

export function UserMessage({
	message,
	anchorMessageId,
	workspaceId,
	workspaceCwd,
	isEditing,
	isSubmitting,
	onStartEdit,
	onCancelEdit,
	onSubmitEdit,
	onRestart,
	actionDisabled = false,
}: UserMessageProps) {
	const addFileViewerPane = useTabsStore((store) => store.addFileViewerPane);
	const draft = getUserMessageDraft(message);
	const fullText = draft.text;
	const [copied, setCopied] = useState(false);
	const isPersistedMessage =
		!message.id.startsWith("optimistic-") &&
		!message.id.startsWith("immediate-user-message-");

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

		void onRestart({
			anchorMessageId,
			messageId: message.id,
			payload: resendPayload,
		}).catch((error) => {
			console.debug("[UserMessage] resend failed", error);
		});
	}, [anchorMessageId, draft.files, draft.text, message.id, onRestart]);
	const showActions =
		!isEditing &&
		Boolean(fullText || draft.files.length > 0) &&
		isPersistedMessage;

	return (
		<div
			className="group/msg flex flex-col items-end gap-2"
			data-chat-user-message="true"
			data-message-id={message.id}
		>
			{isEditing ? (
				<UserMessageEditor
					initialDraft={draft}
					isSubmitting={isSubmitting}
					onCancel={onCancelEdit}
					onSubmit={(payload) =>
						onSubmitEdit({
							anchorMessageId,
							messageId: message.id,
							payload,
						})
					}
				/>
			) : null}
			{message.content.some(
				(part) =>
					part.type === "image" || (part as { type?: string }).type === "file",
			) &&
				!isEditing && (
					<div className="flex max-w-[85%] flex-wrap justify-end gap-2">
						{message.content.map(
							(part: MastraMessagePart, partIndex: number) => {
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
										<div
											key={`${message.id}-${partIndex}`}
											className="max-w-[85%]"
										>
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
							},
						)}
					</div>
				)}
			{!isEditing
				? message.content.map((part: MastraMessagePart, partIndex: number) => {
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
					})
				: null}
			{showActions ? (
				<div className="opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">
					<MessageActions className="rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur-xs">
						<MessageAction
							className="size-7 text-muted-foreground hover:text-foreground"
							label="Resend message"
							onClick={handleResend}
							tooltip="Resend"
							disabled={actionDisabled}
						>
							<RotateCcwIcon className="size-3.5" />
						</MessageAction>
						<MessageAction
							className="size-7 text-muted-foreground hover:text-foreground"
							label="Edit message"
							onClick={() => onStartEdit(message.id)}
							tooltip="Edit"
							disabled={actionDisabled}
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
		</div>
	);
}
