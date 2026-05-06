import { useCallback, useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useTabsStore } from "renderer/stores/tabs/store";
import type {
	UserMessageActionPayload,
	UserMessageRestartRequest,
} from "../../ChatMessageList.types";
import { UserMessageActions } from "./components/UserMessageActions";
import { UserMessageAttachments } from "./components/UserMessageAttachments";
import { UserMessageEditor } from "./components/UserMessageEditor";
import { UserMessageText } from "./components/UserMessageText";
import type { ChatMessage } from "./types";
import { getUserMessageDraft } from "./utils/getUserMessageDraft";

interface UserMessageProps {
	message: ChatMessage;
	prefixMessages: ChatMessage[];
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
	prefixMessages,
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
	const { copyToClipboard } = useCopyToClipboard();
	const handleCopy = useCallback(() => {
		if (!fullText) return;
		copyToClipboard(fullText);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}, [fullText, copyToClipboard]);
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
			messageId: message.id,
			prefixMessages,
			payload: resendPayload,
		}).catch((error) => {
			console.debug("[UserMessage] resend failed", error);
		});
	}, [draft.files, draft.text, message.id, onRestart, prefixMessages]);
	const showActions =
		!isEditing &&
		Boolean(fullText || draft.files.length > 0) &&
		isPersistedMessage;

	return (
		<div
			className="group/msg flex max-w-full flex-col items-end gap-2"
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
							messageId: message.id,
							prefixMessages,
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
					<UserMessageAttachments
						message={message}
						onOpenAttachment={openAttachment}
					/>
				)}
			{!isEditing ? (
				<UserMessageText
					message={message}
					workspaceCwd={workspaceCwd}
					onOpenMentionedFile={openMentionedFile}
				/>
			) : null}
			{showActions ? (
				<UserMessageActions
					actionDisabled={actionDisabled}
					copied={copied}
					fullText={fullText}
					onCopy={handleCopy}
					onEdit={() => onStartEdit(message.id)}
					onResend={handleResend}
				/>
			) : null}
		</div>
	);
}
