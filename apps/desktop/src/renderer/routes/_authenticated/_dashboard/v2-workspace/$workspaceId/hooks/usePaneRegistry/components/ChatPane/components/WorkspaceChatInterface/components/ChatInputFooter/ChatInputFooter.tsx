import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	type PromptInputMessage,
	PromptInputTextarea,
} from "@superset/ui/ai-elements/prompt-input";
import type { ThinkingLevel } from "@superset/ui/ai-elements/thinking-toggle";
import type { ChatStatus, FileUIPart } from "ai";
import type React from "react";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { IssueLinkCommand } from "renderer/components/Chat/ChatInterface/components/IssueLinkCommand";
import { SlashCommandInput } from "renderer/components/Chat/ChatInterface/components/SlashCommandInput";
import { useFocusPromptOnPane } from "renderer/components/Chat/ChatInterface/hooks/useFocusPromptOnPane";
import type { SlashCommand } from "renderer/components/Chat/ChatInterface/hooks/useSlashCommands";
import type {
	ModelOption,
	PermissionMode,
} from "renderer/components/Chat/ChatInterface/types";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { MentionAnchor, MentionProvider } from "../MentionPopover";
import { ChatComposerControls } from "./components/ChatComposerControls";
import { ChatInputDropZone } from "./components/ChatInputDropZone";
import { ChatShortcuts } from "./components/ChatShortcuts";
import { FileDropOverlay } from "./components/FileDropOverlay";
import { LinkedIssues } from "./components/LinkedIssues";
import { SlashCommandPreview } from "./components/SlashCommandPreview";
import type { LinkedIssue } from "./types";
import { getErrorMessage } from "./utils/getErrorMessage";

interface ChatInputFooterProps {
	sessionId: string | null;
	workspaceId: string;
	cwd: string;
	isFocused: boolean;
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
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
	slashCommands: SlashCommand[];
	submitDisabled?: boolean;
	renderAttachment?: (file: FileUIPart & { id: string }) => ReactNode;
	onSubmitStart?: () => void;
	onSubmitEnd?: () => void;
	onSend: (message: PromptInputMessage) => Promise<void> | void;
	onStop: (e: React.MouseEvent) => void;
	onSlashCommandSend: (command: SlashCommand) => void;
}

export function ChatInputFooter({
	sessionId,
	workspaceId,
	cwd,
	isFocused,
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
	thinkingLevel,
	setThinkingLevel,
	slashCommands,
	submitDisabled,
	renderAttachment,
	onSubmitStart,
	onSubmitEnd,
	onSend,
	onStop,
	onSlashCommandSend,
}: ChatInputFooterProps) {
	useFocusPromptOnPane(isFocused);
	const [issueLinkOpen, setIssueLinkOpen] = useState(false);
	const [linkedIssues, setLinkedIssues] = useState<LinkedIssue[]>([]);
	const inputRootRef = useRef<HTMLDivElement>(null);
	const errorMessage = getErrorMessage(error);
	const focusShortcutText = useHotkeyDisplay("FOCUS_CHAT_INPUT").text;
	const showFocusHint = focusShortcutText !== "Unassigned";

	const addLinkedIssue = useCallback(
		(slug: string, title: string, taskId: string | undefined, url?: string) => {
			setLinkedIssues((prev) => {
				if (prev.some((issue) => issue.slug === slug)) return prev;
				return [...prev, { slug, title, taskId, url }];
			});
		},
		[],
	);

	const removeLinkedIssue = useCallback((slug: string) => {
		setLinkedIssues((prev) => prev.filter((issue) => issue.slug !== slug));
	}, []);

	const handleSend = useCallback(
		(message: PromptInputMessage) => {
			if (linkedIssues.length === 0) return onSend(message);

			const prefix = linkedIssues
				.map((issue) => `@task:${issue.slug}`)
				.join(" ");
			const modifiedMessage: PromptInputMessage = {
				...message,
				text: `${prefix} ${message.text}`,
			};
			setLinkedIssues([]);
			return onSend(modifiedMessage);
		},
		[linkedIssues, onSend],
	);

	return (
		<ChatInputDropZone className="bg-background px-4 py-3">
			{(dragType) => (
				<div className="mx-auto w-full max-w-[680px]">
					{errorMessage && (
						<p
							role="alert"
							className="mb-3 select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
						>
							{errorMessage}
						</p>
					)}
					<SlashCommandInput
						onCommandSend={onSlashCommandSend}
						commands={slashCommands}
					>
						<MentionProvider cwd={cwd}>
							<MentionAnchor>
								<div
									ref={inputRootRef}
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
										onSubmit={handleSend}
										multiple
										maxFiles={5}
										maxFileSize={10 * 1024 * 1024}
										globalDrop
									>
										<ChatShortcuts
											isFocused={isFocused}
											setIssueLinkOpen={setIssueLinkOpen}
										/>
										<IssueLinkCommand
											open={issueLinkOpen}
											onOpenChange={setIssueLinkOpen}
											onSelect={addLinkedIssue}
										/>
										<FileDropOverlay visible={dragType === "files"} />
										<PromptInputAttachments>
											{renderAttachment ??
												((file) => <PromptInputAttachment data={file} />)}
										</PromptInputAttachments>
										<LinkedIssues
											issues={linkedIssues}
											onRemove={removeLinkedIssue}
										/>
										<SlashCommandPreview
											sessionId={sessionId}
											workspaceId={workspaceId}
											slashCommands={slashCommands}
										/>
										<PromptInputTextarea
											placeholder="Ask to make changes, @mention files, run /commands"
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
											thinkingLevel={thinkingLevel}
											setThinkingLevel={setThinkingLevel}
											canAbort={canAbort}
											submitStatus={submitStatus}
											submitDisabled={submitDisabled}
											onStop={onStop}
											onLinkIssue={() => setIssueLinkOpen(true)}
										/>
									</PromptInput>
								</div>
							</MentionAnchor>
						</MentionProvider>
					</SlashCommandInput>
					<div className="py-1.5" />
				</div>
			)}
		</ChatInputDropZone>
	);
}
