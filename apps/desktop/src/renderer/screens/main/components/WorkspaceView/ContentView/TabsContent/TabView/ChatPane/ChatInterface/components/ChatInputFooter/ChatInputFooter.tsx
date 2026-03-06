import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	type PromptInputMessage,
	PromptInputTextarea,
} from "@superset/ui/ai-elements/prompt-input";
import type { ChatStatus, FileUIPart } from "ai";
import type React from "react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useHotkeyText } from "renderer/stores/hotkeys";
import type { SlashCommand } from "../../hooks/useSlashCommands";
import type { ModelOption, PermissionMode } from "../../types";
import { MentionAnchor, MentionProvider } from "../MentionPopover";
import { SlashCommandInput } from "../SlashCommandInput";
import { ChatComposerControls } from "./components/ChatComposerControls";
import { ChatInputDropZone } from "./components/ChatInputDropZone";
import { ChatShortcuts } from "./components/ChatShortcuts";
import { FileDropOverlay } from "./components/FileDropOverlay";
import { IssueLinkInserter } from "./components/IssueLinkInserter";
import { SlashCommandPreview } from "./components/SlashCommandPreview";
import { getErrorMessage } from "./utils/getErrorMessage";

interface ChatInputFooterProps {
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
	thinkingEnabled: boolean;
	setThinkingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
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
	thinkingEnabled,
	setThinkingEnabled,
	slashCommands,
	submitDisabled,
	renderAttachment,
	onSubmitStart,
	onSubmitEnd,
	onSend,
	onStop,
	onSlashCommandSend,
}: ChatInputFooterProps) {
	const [issueLinkOpen, setIssueLinkOpen] = useState(false);
	const inputRootRef = useRef<HTMLDivElement>(null);
	const errorMessage = getErrorMessage(error);
	const focusShortcutText = useHotkeyText("FOCUS_CHAT_INPUT");
	const showFocusHint = focusShortcutText !== "Unassigned";

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
										onSubmit={onSend}
										multiple
										maxFiles={5}
										maxFileSize={10 * 1024 * 1024}
										globalDrop
									>
										<ChatShortcuts
											isFocused={isFocused}
											setIssueLinkOpen={setIssueLinkOpen}
											inputRootRef={inputRootRef}
										/>
										<IssueLinkInserter
											issueLinkOpen={issueLinkOpen}
											setIssueLinkOpen={setIssueLinkOpen}
										/>
										<FileDropOverlay visible={dragType === "files"} />
										<PromptInputAttachments>
											{renderAttachment ??
												((file) => <PromptInputAttachment data={file} />)}
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
											submitDisabled={submitDisabled}
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
