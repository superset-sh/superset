import type { SlashCommand } from "@superset/durable-session/react";
import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputButton,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { ThinkingToggle } from "@superset/ui/ai-elements/thinking-toggle";
import { UploadIcon } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiMiniPaperClip } from "react-icons/hi2";
import type { ModelOption, PermissionMode } from "../../types";
import {
	FileMentionAnchor,
	FileMentionProvider,
	FileMentionTrigger,
} from "../FileMentionPopover";
import { ModelPicker } from "../ModelPicker";
import { PermissionModePicker } from "../PermissionModePicker";
import { SlashCommandInput } from "../SlashCommandInput";

interface ChatInputFooterProps {
	cwd: string;
	error: string | null;
	isStreaming: boolean;
	availableModels: ModelOption[];
	selectedModel: ModelOption;
	setSelectedModel: React.Dispatch<React.SetStateAction<ModelOption>>;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
	permissionMode: PermissionMode;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	thinkingEnabled: boolean;
	setThinkingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
	slashCommands: SlashCommand[];
	onSend: (message: PromptInputMessage) => void;
	onStop: (e: React.MouseEvent) => void;
	onSlashCommandSend: (command: SlashCommand) => void;
}

function useDocumentDrag() {
	const [isDragging, setIsDragging] = useState(false);
	const counter = useRef(0);

	const onEnter = useCallback((e: DragEvent) => {
		if (e.dataTransfer?.types?.includes("Files")) {
			counter.current++;
			setIsDragging(true);
		}
	}, []);

	const onLeave = useCallback(() => {
		counter.current--;
		if (counter.current === 0) setIsDragging(false);
	}, []);

	const onDrop = useCallback(() => {
		counter.current = 0;
		setIsDragging(false);
	}, []);

	useEffect(() => {
		document.addEventListener("dragenter", onEnter);
		document.addEventListener("dragleave", onLeave);
		document.addEventListener("drop", onDrop);
		return () => {
			document.removeEventListener("dragenter", onEnter);
			document.removeEventListener("dragleave", onLeave);
			document.removeEventListener("drop", onDrop);
		};
	}, [onEnter, onLeave, onDrop]);

	return isDragging;
}

function PaperclipButton() {
	const attachments = usePromptInputAttachments();
	return (
		<PromptInputButton onClick={() => attachments.openFileDialog()}>
			<HiMiniPaperClip className="size-4" />
		</PromptInputButton>
	);
}

export function ChatInputFooter({
	cwd,
	error,
	isStreaming,
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
	onSend,
	onStop,
	onSlashCommandSend,
}: ChatInputFooterProps) {
	const isDragging = useDocumentDrag();

	return (
		<div className="border-t bg-background px-4 py-3">
			<div className="mx-auto w-full max-w-3xl">
				{error && (
					<div className="mb-3 select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
						{error}
					</div>
				)}
				<FileMentionProvider cwd={cwd}>
					<SlashCommandInput
						onCommandSend={onSlashCommandSend}
						commands={slashCommands}
					>
						<FileMentionAnchor>
							<PromptInput
								onSubmit={onSend}
								multiple
								maxFiles={5}
								maxFileSize={10 * 1024 * 1024}
								globalDrop
							>
								{isDragging && (
									<div className="mx-3 mt-3 flex self-stretch flex-col items-center gap-2 bg-muted py-6">
										<div className="flex size-8 items-center justify-center rounded-full bg-muted-foreground/20">
											<UploadIcon className="size-4 text-muted-foreground" />
										</div>
										<p className="font-medium text-foreground text-sm">
											Drop files here
										</p>
										<p className="text-muted-foreground text-xs">
											Images, PDFs, text files, or folders
										</p>
									</div>
								)}
								<PromptInputAttachments>
									{(file) => <PromptInputAttachment data={file} />}
								</PromptInputAttachments>
								<PromptInputTextarea placeholder="Ask anything..." />
								<PromptInputFooter>
									<PromptInputTools>
										<PaperclipButton />
										<FileMentionTrigger />
										<ThinkingToggle
											enabled={thinkingEnabled}
											onToggle={setThinkingEnabled}
										/>
										<ModelPicker
											models={availableModels}
											selectedModel={selectedModel}
											onSelectModel={setSelectedModel}
											open={modelSelectorOpen}
											onOpenChange={setModelSelectorOpen}
										/>
										<PermissionModePicker
											selectedMode={permissionMode}
											onSelectMode={setPermissionMode}
										/>
									</PromptInputTools>
									<PromptInputSubmit
										status={isStreaming ? "streaming" : undefined}
										onClick={isStreaming ? onStop : undefined}
									/>
								</PromptInputFooter>
							</PromptInput>
						</FileMentionAnchor>
					</SlashCommandInput>
				</FileMentionProvider>
			</div>
		</div>
	);
}
