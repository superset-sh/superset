import { useLingui } from "@lingui/react/macro";
import type {
	AvailableCommand,
	SessionConfigOption,
	UserContent,
	UserMessage,
} from "@superset/chat/protocol";
import type {
	ComposerChip,
	ComposerDraft,
	ComposerMentionEntry,
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputHandle,
	PromptInputSubmitPayload,
} from "@superset/chat-ui/PromptInput";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
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
import { useHotkey } from "renderer/hotkeys";
import { FileIcon, getFileIcon } from "renderer/lib/fileIcons";
import { AgentComposer } from "renderer/routes/_authenticated/components/AgentComposer";
import {
	type AgentSwitcher,
	ModelPicker,
} from "renderer/routes/_authenticated/components/AgentComposer/components/ModelPicker";
import {
	ModePicker,
	type SessionMode,
} from "renderer/routes/_authenticated/components/AgentComposer/components/ModePicker";
import { useFooterTier } from "renderer/routes/_authenticated/components/AgentComposer/hooks/useFooterTier";
import { useGitHubMentionProviders } from "renderer/routes/_authenticated/components/AgentComposer/hooks/useGitHubMentionProviders";
import { CHAT_COLUMN_CLASSNAME, CHAT_GUTTER_CLASSNAME } from "../../constants";
import { commandChip, LEADING_COMMAND } from "../../utils/commandChip";
import { mcpContextLine } from "../../utils/mcpServerChips";
import { elementsForChips } from "../../utils/messageElements";
import { QueuedPrompts } from "./components/QueuedPrompts";
import { takeRecoveredDraft, useComposerDraft } from "./hooks/useComposerDraft";
import { useMcpServerPicker } from "./hooks/useMcpServerPicker";
import { useQueueActions } from "./hooks/useQueueActions";
import { useUploadAttachments } from "./hooks/useUploadAttachments";

export type ComposerProps = {
	workspaceId: string;
	presetId?: string;
	draftKey: string;
	inputRef?: Ref<Pick<PromptInputHandle, "restoreDraft" | "focus">>;
	availableCommands: AvailableCommand[];
	configOptions?: SessionConfigOption[];
	onSetConfigOption?: (configId: string, value: string) => unknown;
	agentSwitcher?: AgentSwitcher;
	modes?: SessionMode[];
	currentModeId?: string;
	onSetMode?: (modeId: string) => void;
	// `draft` is what the composer held, for the host to hand back if the send fails.
	onSend: (
		content: UserContent[],
		options: { steer: boolean; draft: ComposerDraft },
	) => unknown;
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
		update: (itemId: string, content: UserContent[]) => Promise<void>;
	};
};

const HIDDEN_AGENT_COMMANDS = new Set(["rewind"]);

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
	presetId,
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
	const { hostUrl } = useWorkspaceClient();
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const githubProviders = useGitHubMentionProviders(
		useMemo(
			() =>
				workspace?.projectId && hostUrl
					? { projectId: workspace.projectId, hostUrl }
					: null,
			[workspace?.projectId, hostUrl],
		),
	);
	const uploadAttachments = useUploadAttachments(workspaceId);
	const { storedDraft, onDraftChange, clearDraft } = useComposerDraft(draftKey);
	const promptInputRef = useRef<PromptInputHandle>(null);
	const queueActions = useQueueActions(promptQueue);
	const mcpPicker = useMcpServerPicker({ workspaceId, presetId });
	useImperativeHandle(
		inputRef,
		() => ({
			restoreDraft: (draft: ComposerDraft) =>
				promptInputRef.current?.restoreDraft(draft),
			focus: () => promptInputRef.current?.focus(),
		}),
		[],
	);
	const rootRef = useRef<HTMLDivElement>(null);
	const footerTier = useFooterTier(rootRef);
	useEffect(() => {
		const recovered = takeRecoveredDraft(draftKey);
		if (recovered) promptInputRef.current?.restoreDraft(recovered);
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
					icon: <FileIcon className="size-4" fileName={match.name} />,
					// The agent reads the path itself, so a mention is the path.
					select: (ctx) =>
						ctx.insertChip({
							label: match.name,
							serialized: match.relativePath,
							iconUrl: getFileIcon(match.name, false).src,
							data: { elementKind: "file_mention" },
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
			...githubProviders,
		],
		[githubProviders, searchFiles, t],
	);

	const mcpCommand = mcpPicker.command;
	const commands = useMemo(() => {
		const local: PromptInputCommand[] = [...(mcpCommand ? [mcpCommand] : [])];
		const agentCommands = toMenuCommands(
			availableCommands.filter(
				(command) =>
					!(mcpCommand && command.name === "mcp") &&
					!HIDDEN_AGENT_COMMANDS.has(command.name),
			),
			{
				commands: t({ message: "Commands" }),
				mcp: t({ message: "MCP Server Commands" }),
			},
		);
		return [...local, ...agentCommands];
	}, [availableCommands, mcpCommand, t]);

	const send = useCallback(
		async (
			text: string,
			files: File[],
			mentions: ComposerChip[],
			steer: boolean,
			draft: ComposerDraft,
		) => {
			const tags = await uploadAttachments(files);
			if (!tags) {
				promptInputRef.current?.restoreDraft(draft);
				return;
			}
			const message = text.trim();
			const elements = elementsForChips(message, mentions);
			const mcpContext = mcpContextLine(
				mentions.flatMap((chip) => mcpPicker.serverNameOf(chip) ?? []),
			);
			onSend(
				[
					{
						type: "text",
						text: [message, ...tags].filter(Boolean).join("\n"),
						...(elements.length > 0 ? { elements } : {}),
					},
					...(mcpContext
						? [{ type: "text" as const, text: mcpContext, hidden: true }]
						: []),
				],
				{ steer, draft },
			);
			clearDraft();
		},
		[onSend, uploadAttachments, clearDraft, mcpPicker.serverNameOf],
	);

	const handleSubmit = useCallback(
		({ text, files, mentions, steer, draft }: PromptInputSubmitPayload) => {
			if (disabled || (text.trim() === "" && files.length === 0)) return false;
			const name = LEADING_COMMAND.exec(text.trim())?.[1];
			const input = promptInputRef.current;
			if (text.trim() === "/mcp" && mcpPicker.command && input) {
				queueMicrotask(() =>
					mcpPicker.open.current({
						insertChip: input.insertChip,
						attachFiles: input.openFileDialog,
						openPanel: input.openPanel,
						query: "",
					}),
				);
				return;
			}
			if (
				name &&
				availableCommands.length > 0 &&
				!availableCommands.some((command) => command.name === name)
			) {
				toast.error(t({ message: `Unknown command /${name}` }));
				return false;
			}
			return send(text, files, mentions, steer, draft);
		},
		[availableCommands, disabled, send, t, mcpPicker],
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
				commands={commands}
				draft={storedDraft}
				history={history}
				key={draftKey}
				mentionProviders={mentionProviders}
				onDraftChange={onDraftChange}
				onStop={onCancelTurn ?? undefined}
				onSubmit={handleSubmit}
				ref={promptInputRef}
				placeholder={
					placeholder ??
					t({ message: "Ask the agent, @mention files, run /commands" })
				}
				status={onCancelTurn ? "streaming" : "ready"}
				toolbar={
					modes && onSetMode ? (
						<ModePicker
							currentModeId={currentModeId}
							iconOnly={footerTier >= 2}
							modes={modes}
							onSelect={onSetMode}
						/>
					) : undefined
				}
				toolbarEnd={
					configOptions && onSetConfigOption ? (
						<ModelPicker
							agentSwitcher={agentSwitcher}
							configOptions={configOptions}
							hideEffortLabel={footerTier >= 1}
							hideModelLabel={footerTier >= 3}
							onSelect={onSetConfigOption}
						/>
					) : undefined
				}
			/>
			{mcpPicker.dialog}
		</div>
	);
});
