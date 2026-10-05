import { useLingui } from "@lingui/react/macro";
import type {
	AvailableCommand,
	SessionConfigOption,
	UserContent,
	UserMessage,
} from "@superset/chat/protocol";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputHandle,
} from "@superset/chat-ui/PromptInput";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { memo, useCallback, useMemo, useRef } from "react";
import { AgentComposer } from "renderer/routes/_authenticated/components/AgentComposer";
import { CHAT_COLUMN_CLASSNAME, CHAT_GUTTER_CLASSNAME } from "../../constants";
import { ModelPicker } from "./components/ModelPicker";
import { ModePicker, type SessionMode } from "./components/ModePicker";
import { QueuedPrompts } from "./components/QueuedPrompts";
import { useComposerDraft } from "./hooks/useComposerDraft";
import { useQueueActions } from "./hooks/useQueueActions";
import { useUploadAttachments } from "./hooks/useUploadAttachments";

export type ComposerProps = {
	workspaceId: string;
	draftKey: string;
	availableCommands: AvailableCommand[];
	configOptions?: SessionConfigOption[];
	onSetConfigOption?: (configId: string, value: string) => unknown;
	modes?: SessionMode[];
	currentModeId?: string;
	onSetMode?: (modeId: string) => void;
	onSend: (content: UserContent[]) => unknown;
	placeholder?: string;
	disabled?: boolean;
	onCancelTurn?: (() => void) | null;
	promptQueue?: {
		prompts: UserMessage[];
		paused: boolean;
		actionable: boolean;
		remove: (itemId: string) => Promise<void>;
		resume: () => Promise<void>;
		steer: (itemId: string) => Promise<void>;
	};
};

/**
 * The agent's own slash commands, in the shape the composer's menu takes.
 * Selecting one inserts a chip that serializes back to `/name`, so what the
 * agent receives is the command it advertised.
 */
function toMenuCommands(commands: AvailableCommand[]): PromptInputCommand[] {
	return commands.map((command) => ({
		id: command.name,
		title: `/${command.name}`,
		description: command.description ?? command.hint ?? "",
		onSelect: (ctx) =>
			ctx.insertChip({
				label: `/${command.name}`,
				serialized: `/${command.name}`,
			}),
	}));
}

export const Composer = memo(function Composer({
	availableCommands,
	configOptions,
	currentModeId,
	modes,
	onSetConfigOption,
	onSetMode,
	disabled,
	draftKey,
	onCancelTurn,
	onSend,
	placeholder,
	promptQueue,
	workspaceId,
}: ComposerProps) {
	const { t } = useLingui();
	const trpcUtils = workspaceTrpc.useUtils();
	const uploadAttachments = useUploadAttachments();
	const { storedDraft, onChange, clearDraft } = useComposerDraft(draftKey);
	const promptInputRef = useRef<PromptInputHandle>(null);
	const queueActions = useQueueActions(promptQueue, promptInputRef);
	const searchFiles = useCallback(
		async (query: string) => {
			const { matches } = await trpcUtils.filesystem.searchFiles.fetch({
				workspaceId,
				query,
				includeHidden: false,
				limit: 20,
			});
			return matches.map(
				(match): ComposerMentionEntry => ({
					id: match.absolutePath,
					label: match.name,
					description: match.relativePath,
					// The agent reads the path itself, so a mention is the path.
					select: (ctx) =>
						ctx.insertChip({
							label: match.name,
							serialized: match.relativePath,
						}),
				}),
			);
		},
		[trpcUtils, workspaceId],
	);

	const mentionProviders = useMemo<ComposerMentionProvider[]>(
		() => [
			{
				id: "files",
				title: t({ message: "Files" }),
				priority: 1,
				source: {
					kind: "search",
					search: searchFiles,
					emptyState: t({ message: "No matching files" }),
				},
			},
		],
		[searchFiles, t],
	);

	const commands = useMemo(
		() => toMenuCommands(availableCommands),
		[availableCommands],
	);

	const handleSubmit = useCallback(
		async ({ text, files }: { text: string; files: File[] }) => {
			if (disabled || (text.trim() === "" && files.length === 0)) return;
			const attachments = await uploadAttachments(files);
			if (!attachments) return;
			onSend([
				...(text.trim() === "" ? [] : [{ type: "text" as const, text }]),
				...attachments,
			]);
			clearDraft();
		},
		[disabled, onSend, uploadAttachments, clearDraft],
	);

	return (
		<div className={cn(CHAT_GUTTER_CLASSNAME, "pt-1 pb-5")}>
			{promptQueue && (
				<div className={CHAT_COLUMN_CLASSNAME}>
					<QueuedPrompts
						{...queueActions}
						actionable={promptQueue.actionable}
						paused={promptQueue.paused}
						prompts={promptQueue.prompts}
					/>
				</div>
			)}
			<AgentComposer
				className={CHAT_COLUMN_CLASSNAME}
				clearOnSubmit={!disabled}
				commands={commands}
				defaultValue={storedDraft}
				key={draftKey}
				mentionProviders={mentionProviders}
				onChange={onChange}
				onStop={onCancelTurn ?? undefined}
				onSubmit={handleSubmit}
				ref={promptInputRef}
				placeholder={
					placeholder ??
					t({ message: "Ask the agent, @mention files, run /commands" })
				}
				status={onCancelTurn ? "streaming" : "ready"}
				submitWhileStreaming={promptQueue !== undefined}
				toolbar={
					modes && onSetMode ? (
						<ModePicker
							currentModeId={currentModeId}
							modes={modes}
							onSelect={onSetMode}
						/>
					) : null
				}
				toolbarEnd={
					configOptions && onSetConfigOption ? (
						<ModelPicker
							configOptions={configOptions}
							onSelect={onSetConfigOption}
						/>
					) : null
				}
			/>
		</div>
	);
});
