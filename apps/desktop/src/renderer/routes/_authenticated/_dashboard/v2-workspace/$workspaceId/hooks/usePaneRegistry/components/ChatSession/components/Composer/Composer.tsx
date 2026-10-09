import { useLingui } from "@lingui/react/macro";
import type {
	AvailableCommand,
	SessionConfigOption,
	UserContent,
	UserMessage,
} from "@superset/chat/protocol";
import type {
	ComposerChip,
	ComposerMentionEntry,
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputHandle,
	PromptInputSubmitPayload,
} from "@superset/chat-ui/PromptInput";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	memo,
	type KeyboardEvent as ReactKeyboardEvent,
	type Ref,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { env } from "renderer/env.renderer";
import { useHotkey } from "renderer/hotkeys";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";
import { AgentComposer } from "renderer/routes/_authenticated/components/AgentComposer";
import { CHAT_COLUMN_CLASSNAME, CHAT_GUTTER_CLASSNAME } from "../../constants";
import { commandChip, LEADING_COMMAND } from "../../utils/commandChip";
import { elementsForChips } from "../../utils/messageElements";
import { type AgentSwitcher, ModelPicker } from "./components/ModelPicker";
import { ModePicker, type SessionMode } from "./components/ModePicker";
import { QueuedPrompts } from "./components/QueuedPrompts";
import {
	takeRecoveredDraftText,
	useComposerDraft,
} from "./hooks/useComposerDraft";
import { useQueueActions } from "./hooks/useQueueActions";
import { useUploadAttachments } from "./hooks/useUploadAttachments";

export type ComposerProps = {
	workspaceId: string;
	draftKey: string;
	inputRef?: Ref<Pick<PromptInputHandle, "appendText" | "focus">>;
	availableCommands: AvailableCommand[];
	configOptions?: SessionConfigOption[];
	onSetConfigOption?: (configId: string, value: string) => unknown;
	agentSwitcher?: AgentSwitcher;
	modes?: SessionMode[];
	currentModeId?: string;
	onSetMode?: (modeId: string) => void;
	onSend: (content: UserContent[], options: { steer: boolean }) => unknown;
	history?: string[];
	isActive?: boolean;
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
function toMenuCommands(
	commands: AvailableCommand[],
	groups: { commands: string; mcp: string },
): PromptInputCommand[] {
	return commands.map((command) => ({
		id: command.name,
		title: `/${command.name}`,
		...(command.hint ? { hint: command.hint } : {}),
		description: command.description ?? "",
		group: command.category === "mcp" ? groups.mcp : groups.commands,
		onSelect: (ctx) => {
			ctx.insertChip(commandChip(command.name, command.description));
		},
	}));
}

const FOCUS_HANDOFF_MS = 1000;
let focusHandoff: { draftKey: string; at: number } | null = null;

export const Composer = memo(function Composer({
	agentSwitcher,
	availableCommands,
	configOptions,
	currentModeId,
	modes,
	onSetConfigOption,
	onSetMode,
	disabled,
	draftKey,
	inputRef,
	history,
	isActive,
	onCancelTurn,
	onSend,
	placeholder,
	promptQueue,
	workspaceId,
}: ComposerProps) {
	const { t } = useLingui();
	const trpcUtils = workspaceTrpc.useUtils();
	const cloudUtils = cloudTrpc.useUtils();
	const uploadAttachments = useUploadAttachments(workspaceId);
	const { storedDraft, onChange, clearDraft } = useComposerDraft(draftKey);
	const promptInputRef = useRef<PromptInputHandle>(null);
	const queueActions = useQueueActions(promptQueue, promptInputRef);
	useImperativeHandle(
		inputRef,
		() => ({
			appendText: (text: string) => promptInputRef.current?.appendText(text),
			focus: () => promptInputRef.current?.focus(),
		}),
		[],
	);
	const rootRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const recovered = takeRecoveredDraftText(draftKey);
		if (recovered) promptInputRef.current?.appendText(recovered);
	}, [draftKey]);
	useLayoutEffect(() => {
		const handoff = focusHandoff;
		if (handoff?.draftKey === draftKey) {
			focusHandoff = null;
			const focusIsFree =
				!document.activeElement || document.activeElement === document.body;
			if (focusIsFree && Date.now() - handoff.at < FOCUS_HANDOFF_MS) {
				promptInputRef.current?.focus();
			}
		}
		const root = rootRef.current;
		return () => {
			if (root?.contains(document.activeElement)) {
				focusHandoff = { draftKey, at: Date.now() };
			}
		};
	}, [draftKey]);
	useHotkey("FOCUS_CHAT_INPUT", () => promptInputRef.current?.focus(), {
		enabled: Boolean(isActive),
	});
	useHotkey(
		"CHAT_ADD_ATTACHMENT",
		() => promptInputRef.current?.openFileDialog(),
		{ enabled: Boolean(isActive) },
	);
	useEffect(() => {
		if (!isActive) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "/" || event.defaultPrevented) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.isComposing || event.getModifierState("AltGraph")) return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest("input, textarea, select, [contenteditable]"))
			)
				return;
			event.preventDefault();
			promptInputRef.current?.focus();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isActive]);
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
							data: { elementKind: "file_mention" },
						}),
				}),
			);
		},
		[trpcUtils, workspaceId],
	);

	const searchPages = useCallback(
		async (query: string) => {
			const { items } = await cloudUtils.page.listPaginated.fetch(
				pagesListInput({ search: query || undefined, limit: 20 }),
			);
			return items.map((page): ComposerMentionEntry => {
				const url = new URL(
					`/page/${encodeURIComponent(page.slug)}`,
					env.NEXT_PUBLIC_WEB_URL,
				).toString();
				return {
					id: page.id,
					label: page.title,
					description: page.slug,
					select: (ctx) =>
						ctx.insertChip({ label: page.title, serialized: url }),
				};
			});
		},
		[cloudUtils],
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
			{
				id: "pages",
				title: t({ message: "Pages" }),
				priority: 2,
				source: {
					kind: "search",
					search: searchPages,
					emptyState: t({ message: "No matching pages" }),
				},
			},
		],
		[searchFiles, searchPages, t],
	);

	const commands = useMemo(
		() =>
			toMenuCommands(availableCommands, {
				commands: t({ message: "Commands" }),
				mcp: t({ message: "MCP Server Commands" }),
			}),
		[availableCommands, t],
	);

	const send = useCallback(
		async (
			text: string,
			files: File[],
			mentions: ComposerChip[],
			steer: boolean,
		) => {
			const tags = await uploadAttachments(files);
			if (!tags) {
				promptInputRef.current?.appendText(text);
				return;
			}
			const elements = elementsForChips(text.trim(), mentions);
			onSend(
				[
					{
						type: "text",
						text: [text.trim(), ...tags].filter(Boolean).join("\n"),
						...(elements.length > 0 ? { elements } : {}),
					},
				],
				{ steer },
			);
			clearDraft();
		},
		[onSend, uploadAttachments, clearDraft],
	);

	const handleSubmit = useCallback(
		({ text, files, mentions, steer }: PromptInputSubmitPayload) => {
			if (disabled || (text.trim() === "" && files.length === 0)) return;
			const name = LEADING_COMMAND.exec(text.trim())?.[1];
			if (
				name &&
				availableCommands.length > 0 &&
				!availableCommands.some((command) => command.name === name)
			) {
				toast.error(t({ message: `Unknown command /${name}` }));
				return false;
			}
			return send(text, files, mentions, steer);
		},
		[availableCommands, disabled, send, t],
	);

	const queueListRef = useRef<HTMLUListElement>(null);
	const focusQueue = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Tab" || !event.shiftKey || !promptQueue?.actionable)
			return;
		if (
			!(event.target instanceof HTMLElement) ||
			!event.target.closest(".prompt-input-editor")
		)
			return;
		const rows =
			queueListRef.current?.querySelectorAll<HTMLElement>("[data-queue-row]");
		const newest = rows?.[rows.length - 1];
		if (!newest) return;
		event.preventDefault();
		event.stopPropagation();
		newest.focus();
	};

	return (
		<div
			ref={rootRef}
			className={cn(CHAT_GUTTER_CLASSNAME, "pt-1 pb-5")}
			onKeyDownCapture={focusQueue}
		>
			{promptQueue && (
				<div className={CHAT_COLUMN_CLASSNAME}>
					<QueuedPrompts
						{...queueActions}
						actionable={promptQueue.actionable}
						listRef={queueListRef}
						onExit={() => promptInputRef.current?.focus()}
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
				history={history}
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
					<div className="flex min-w-0 items-center gap-1">
						{configOptions && onSetConfigOption ? (
							<ModelPicker
								agentSwitcher={agentSwitcher}
								configOptions={configOptions}
								onSelect={onSetConfigOption}
							/>
						) : null}
						{modes && onSetMode ? (
							<ModePicker
								currentModeId={currentModeId}
								modes={modes}
								onSelect={onSetMode}
							/>
						) : null}
					</div>
				}
			/>
		</div>
	);
});
