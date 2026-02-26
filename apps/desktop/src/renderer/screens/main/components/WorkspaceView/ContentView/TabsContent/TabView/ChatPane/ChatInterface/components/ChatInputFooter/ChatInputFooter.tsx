import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	type PromptInputMessage,
	PromptInputTextarea,
	usePromptInputAttachments,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import type { ChatStatus } from "ai";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import {
	formatHotkeyText,
	getCurrentPlatform,
	HOTKEYS,
	matchesHotkeyEvent,
} from "shared/hotkeys";
import type { SlashCommand } from "../../hooks/useSlashCommands";
import type { ModelOption, PermissionMode } from "../../types";
import { IssueLinkCommand } from "../IssueLinkCommand";
import { MentionAnchor, MentionProvider } from "../MentionPopover";
import { SlashCommandInput } from "../SlashCommandInput";
import { ChatComposerControls } from "./components/ChatComposerControls";
import { ChatInputDropZone } from "./components/ChatInputDropZone";
import { FileDropOverlay } from "./components/FileDropOverlay";
import { SlashCommandPreview } from "./components/SlashCommandPreview";
import { getErrorMessage } from "./utils/getErrorMessage";

interface ChatInputFooterProps {
	cwd: string;
	error: unknown;
	canAbort: boolean;
	submitStatus?: ChatStatus;
	availableModels: ModelOption[];
	selectedModel: ModelOption | null;
	setSelectedModel: React.Dispatch<React.SetStateAction<ModelOption | null>>;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
	permissionMode: PermissionMode;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	thinkingEnabled: boolean;
	setThinkingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
	slashCommands: SlashCommand[];
	onSubmitStart?: () => void;
	onSubmitEnd?: () => void;
	onSend: (message: PromptInputMessage) => void;
	onStop: (e: React.MouseEvent) => void;
	onSlashCommandSend: (command: SlashCommand) => void;
}

function ChatShortcuts({
	setIssueLinkOpen,
}: {
	setIssueLinkOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
	const attachments = usePromptInputAttachments();
	const platform = getCurrentPlatform();
	const attachKey = HOTKEYS.CHAT_ADD_ATTACHMENT.defaults[platform];
	const linkKey = HOTKEYS.CHAT_LINK_ISSUE.defaults[platform];
	const focusKey = HOTKEYS.FOCUS_CHAT_INPUT.defaults[platform];

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (attachKey && matchesHotkeyEvent(e, attachKey)) {
				e.preventDefault();
				attachments.openFileDialog();
			}
			if (linkKey && matchesHotkeyEvent(e, linkKey)) {
				e.preventDefault();
				setIssueLinkOpen((prev) => !prev);
			}
			if (focusKey && matchesHotkeyEvent(e, focusKey)) {
				e.preventDefault();
				const textarea = document.querySelector<HTMLTextAreaElement>(
					"[data-slot=input-group-control]",
				);
				textarea?.focus();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [attachKey, linkKey, focusKey, attachments, setIssueLinkOpen]);

	return null;
}

function IssueLinkInserter({
	issueLinkOpen,
	setIssueLinkOpen,
}: {
	issueLinkOpen: boolean;
	setIssueLinkOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
	const { textInput } = usePromptInputController();

	const handleSelectTask = useCallback(
		(slug: string) => {
			const current = textInput.value;
			const needsSpace = current.length > 0 && !current.endsWith(" ");
			textInput.setInput(`${current}${needsSpace ? " " : ""}@task:${slug} `);
		},
		[textInput],
	);

	return (
		<IssueLinkCommand
			open={issueLinkOpen}
			onOpenChange={setIssueLinkOpen}
			onSelect={handleSelectTask}
		/>
	);
}

export function ChatInputFooter({
	cwd,
	error,
	canAbort,
	submitStatus,
	availableModels,
	selectedModel,
	setSelectedModel,
	modelSelectorOpen,
	setModelSelectorOpen,
	permissionMode,
	setPermissionMode,
	thinkingEnabled,
	setThinkingEnabled,
	slashCommands,
	onSubmitStart,
	onSubmitEnd,
	onSend,
	onStop,
	onSlashCommandSend,
}: ChatInputFooterProps) {
	const [issueLinkOpen, setIssueLinkOpen] = useState(false);
	const errorMessage = getErrorMessage(error);
	const platform = getCurrentPlatform();
	const focusKey = HOTKEYS.FOCUS_CHAT_INPUT.defaults[platform];
	const focusShortcutText = formatHotkeyText(focusKey, platform);
	const showFocusHint = focusShortcutText !== "Unassigned";

	return (
		<ChatInputDropZone className="bg-background px-4 py-3">
			{(dragType) => (
				<div className="mx-auto w-full max-w-[680px]">
					{errorMessage && (
						<div className="mb-3 select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
							{errorMessage}
						</div>
					)}
					<SlashCommandInput
						onCommandSend={onSlashCommandSend}
						commands={slashCommands}
					>
						<MentionProvider cwd={cwd}>
							<MentionAnchor>
								<div
									className={
										dragType === "path"
											? "relative opacity-50 transition-opacity"
											: "relative"
									}
								>
									{showFocusHint && (
										<span className="pointer-events-none absolute top-3 right-3 z-10 text-xs text-muted-foreground/50 [:focus-within>&]:hidden">
											{focusShortcutText} to focus
										</span>
									)}
									<PromptInput
										className="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
										onSubmitStart={onSubmitStart}
										onSubmitEnd={onSubmitEnd}
										onSubmit={onSend}
										multiple
										maxFiles={5}
										maxFileSize={10 * 1024 * 1024}
										globalDrop
									>
										<ChatShortcuts setIssueLinkOpen={setIssueLinkOpen} />
										<IssueLinkInserter
											issueLinkOpen={issueLinkOpen}
											setIssueLinkOpen={setIssueLinkOpen}
										/>
										<FileDropOverlay visible={dragType === "files"} />
										<PromptInputAttachments>
											{(file) => <PromptInputAttachment data={file} />}
										</PromptInputAttachments>
										<SlashCommandPreview
											cwd={cwd}
											slashCommands={slashCommands}
										/>
										<PromptInputTextarea
											placeholder="Ask anything..."
											className="min-h-10"
										/>
										<ChatComposerControls
											availableModels={availableModels}
											selectedModel={selectedModel}
											setSelectedModel={setSelectedModel}
											modelSelectorOpen={modelSelectorOpen}
											setModelSelectorOpen={setModelSelectorOpen}
											permissionMode={permissionMode}
											setPermissionMode={setPermissionMode}
											thinkingEnabled={thinkingEnabled}
											setThinkingEnabled={setThinkingEnabled}
											canAbort={canAbort}
											submitStatus={submitStatus}
											onStop={onStop}
											onLinkIssue={() => setIssueLinkOpen(true)}
										/>
									</PromptInput>
								</div>
							</MentionAnchor>
						</MentionProvider>
					</SlashCommandInput>
					<div className="flex items-center px-2 pt-1.5">
						<span className="text-xs text-muted-foreground/50">
							Use '@' to mention files, run /commands
						</span>
					</div>
				</div>
			)}
		</ChatInputDropZone>
	);
}
