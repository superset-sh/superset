import type { AppRouter } from "@superset/host-service";
import { formatAttachedFilesBlock } from "@superset/shared/agent-prompt-launch";
import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputButton,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputProvider,
	PromptInputSubmit,
	usePromptInputAttachments,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowUpIcon, PaperclipIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { TiptapPromptEditor } from "renderer/components/Chat/ChatInterface/components/TiptapPromptEditor/TiptapPromptEditor";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { TerminalPaneIcon } from "../TerminalPaneIcon";
import { CLAUDE_CODE_BUILTIN_SLASH_COMMANDS } from "./claudeCodeBuiltinSlashCommands";
import { TerminalComposerControls } from "./components/TerminalComposerControls";
import { TerminalContextUsage } from "./components/TerminalContextUsage";
import { prepareTerminalSubmission } from "./prepareTerminalSubmission";

interface TerminalRichInputProps {
	workspaceId: string;
	terminalId: string;
	terminalInstanceId: string;
	isOpen: boolean;
}

/**
 * Unsent drafts keyed by terminalId, module-scoped so a draft survives the
 * pane being re-pointed at another terminal (session dropdown, tab switch
 * reusing the mounted pane) and comes back when the user returns. Entries are
 * small strings; no eviction needed for a session's lifetime.
 */
const draftsByTerminalId = new Map<string, string>();

/**
 * Module-scoped select mapper (stable identity, so React Query preserves the
 * result across polls). Superset-chat builtins (e.g. /model) carry app
 * actions that only the chat layer can execute — in a PTY they'd submit as
 * meaningless text, so only file-discovered commands (.claude/commands,
 * .agents/commands) are surfaced; the CLI agent in the terminal resolves
 * those itself from the serialized "/name args" text.
 */
const selectTerminalSlashCommands = (
	commands: NonNullable<
		inferRouterOutputs<AppRouter>["chat"]["getSlashCommands"]
	>,
) =>
	commands
		.filter((command) => command.kind !== "builtin")
		.map((command) => ({
			...command,
			kind: "custom" as const,
		}));

/**
 * Paperclip mirroring the chat composer's attach affordance: opens the file
 * dialog wired up by PromptInput's hidden input. Paste and drag-drop feed
 * the same attachments context.
 */
function AttachFileButton() {
	const attachments = usePromptInputAttachments();
	return (
		<PromptInputButton
			aria-label="Attach files"
			className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20"
			onClick={() => attachments.openFileDialog()}
		>
			<PaperclipIcon className="size-3.5 text-muted-foreground" />
		</PromptInputButton>
	);
}

/**
 * Warp-style rich input overlay for a v2 terminal pane. Reuses the chat
 * composer stack (PromptInput + TiptapPromptEditor) so the overlay looks and
 * behaves like the workspace chat input — multiline editing, @file mentions —
 * but submits into the running agent's PTY instead of a chat session:
 * bracketed paste keeps a multiline prompt one literal block, then a
 * carriage return submits it.
 *
 * Submission reads terminalId from props at submit time (via PromptInput's
 * onSubmit), so pane reuse across tab switches — where the same mounted pane
 * is re-pointed at a different terminal — always targets the pane's current
 * terminal.
 */
export function TerminalRichInput(props: TerminalRichInputProps) {
	// Keyed by terminalId: composer state (draft, mention popover, undo
	// history) is scoped to one terminal and rebuilt from the draft map when
	// the pane switches terminals. The provider stays mounted while the
	// overlay toggles so a draft also survives close/reopen.
	return (
		<PromptInputProvider
			key={props.terminalId}
			initialInput={draftsByTerminalId.get(props.terminalId) ?? ""}
		>
			<TerminalRichInputInner {...props} />
		</PromptInputProvider>
	);
}

function TerminalRichInputInner({
	workspaceId,
	terminalId,
	terminalInstanceId,
	isOpen,
}: TerminalRichInputProps) {
	const controller = usePromptInputController();
	const hotkeyText = useHotkeyDisplay("TOGGLE_TERMINAL_RICH_INPUT").text;

	// When Claude Code is the detected agent, the footer swaps the pane icon
	// for chat-composer-style controls that drive the CLI via slash commands.
	const agentBinding = useTerminalAgentBinding(workspaceId, terminalId);
	const isClaudeAgent = agentBinding?.agentId === "claude";

	// Deduped with the page-level workspace.get query; provides the cwd the
	// mention popover uses to shorten paths.
	const { data: workspaceStatus } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ refetchOnWindowFocus: false, retry: false },
	);
	const cwd = workspaceStatus?.worktreePath ?? "";

	const { data: slashCommands = [] } =
		workspaceTrpc.chat.getSlashCommands.useQuery(
			{ workspaceId },
			{ select: selectTerminalSlashCommands },
		);

	// Claude Code's own builtins join the discovered commands when Claude is
	// the detected agent; discovered names win a collision so a project
	// command can shadow a builtin, mirroring the CLI's own precedence.
	const mergedSlashCommands = useMemo(() => {
		if (!isClaudeAgent) return slashCommands;
		const discoveredNames = new Set(slashCommands.map((c) => c.name));
		return [
			...slashCommands,
			...CLAUDE_CODE_BUILTIN_SLASH_COMMANDS.filter(
				(command) => !discoveredNames.has(command.name),
			),
		];
	}, [slashCommands, isClaudeAgent]);

	const trpcUtils = workspaceTrpc.useUtils();
	const searchFiles = useCallback(
		async (query: string) => {
			const { matches } = await trpcUtils.filesystem.searchFiles.fetch({
				workspaceId,
				query,
				includeHidden: false,
				limit: 20,
			});
			return matches.map((m) => ({
				id: m.absolutePath,
				name: m.name,
				relativePath: m.relativePath,
			}));
		},
		[trpcUtils, workspaceId],
	);

	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			const text = prepareTerminalSubmission(message.text) ?? "";

			// Attachments arrive as data URLs (PromptInput converts blobs before
			// onSubmit). Upload each to per-org host storage, resolve to host
			// paths, and append the same "# Attached files" block the agent
			// launch flow uses — CLI agents read the files from disk. A thrown
			// upload error propagates so PromptInput restores the composer.
			const files = (message.files ?? []).filter((file) =>
				file.url?.startsWith("data:"),
			);
			let attachmentBlock = "";
			if (files.length > 0) {
				const attachmentIds = await Promise.all(
					files.map(async (file) => {
						const base64 = file.url.slice(file.url.indexOf(",") + 1);
						const uploaded = await trpcUtils.client.attachments.upload.mutate({
							data: { kind: "base64", data: base64 },
							mediaType: file.mediaType ?? "application/octet-stream",
							originalFilename: file.filename,
						});
						return uploaded.attachmentId;
					}),
				);
				const resolved =
					await trpcUtils.client.attachments.resolveForPrompt.mutate({
						attachmentIds,
					});
				attachmentBlock = formatAttachedFilesBlock(
					resolved.map((item) => item.path),
				);
			}

			const prompt = `${text}${attachmentBlock}`;
			if (prompt.trim().length === 0) return;
			// Bracketed paste keeps the multiline block literal (CLI agents enable
			// the mode); the trailing "\r" then submits it as one prompt.
			terminalRuntimeRegistry.paste(terminalId, prompt, terminalInstanceId);
			terminalRuntimeRegistry.writeInput(terminalId, "\r", terminalInstanceId);
			terminalRuntimeRegistry.scrollToBottom(terminalId, terminalInstanceId);
		},
		[terminalId, terminalInstanceId, trpcUtils],
	);

	// Persist the draft as it changes. terminalId is stable for this provider
	// instance (the provider is keyed by it), so this never writes one
	// terminal's draft under another's key.
	const draftValue = controller.textInput.value;
	useEffect(() => {
		draftsByTerminalId.set(terminalId, draftValue);
	}, [terminalId, draftValue]);

	// Autofocus on open. A single focus() call can land before the Tiptap
	// editor exists (it is created asynchronously — immediatelyRender: false),
	// so retry across frames until focus is actually inside the overlay.
	//
	// The controller is read through a ref: its identity changes on every
	// keystroke (the provider rebuilds it whenever the input value changes),
	// and focus() moves the caret to the end of the editor — re-running this
	// effect per keystroke would yank the cursor to the end while editing
	// mid-text. Only isOpen may retrigger it.
	const rootRef = useRef<HTMLDivElement | null>(null);
	const controllerRef = useRef(controller);
	controllerRef.current = controller;
	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;
		const attempt = (triesLeft: number) => {
			if (cancelled || triesLeft <= 0) return;
			if (rootRef.current?.contains(document.activeElement)) return;
			controllerRef.current.textInput.focus();
			requestAnimationFrame(() => {
				if (cancelled) return;
				attempt(triesLeft - 1);
			});
		};
		attempt(30);
		return () => {
			cancelled = true;
		};
	}, [isOpen]);

	return (
		// Docked below the terminal rather than floating over it: opening adds
		// real layout height, which shrinks the flex-1 terminal box and drives
		// the terminal's ResizeObserver to refit + push content up (instead of
		// covering the last output lines). The grid-rows 0fr→1fr collapse
		// animates that height; the panel stays mounted so drafts and undo
		// survive close/reopen. inert + pointer-events-none keep the collapsed
		// panel out of mouse and tab reach.
		<div
			className={cn(
				"grid shrink-0 transition-[grid-template-rows] duration-150 ease-out",
				isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
			)}
		>
			{/* overflow-clip (not hidden) with a clip margin: the card's border and
			    3px focus ring paint right at this wrapper's bottom/side edges, and a
			    hard clip shaves them off — leaving the glow visible only on top,
			    unlike the chat composer. The margin gives the ring room while still
			    containing the collapse animation. */}
			<div
				ref={rootRef}
				inert={!isOpen || undefined}
				className={cn(
					"min-h-0 overflow-clip [overflow-clip-margin:6px] transition-opacity duration-150 ease-out",
					isOpen ? "opacity-100" : "pointer-events-none opacity-0",
				)}
			>
				{/* Pane root pads p-2 (8px); pt-2 sets the gap to the terminal and
				    the mx-auto max-w keeps the card centered like the chat composer. */}
				<div className="relative mx-auto w-full max-w-[680px] pt-2">
					{hotkeyText !== "Unassigned" && (
						<span className="pointer-events-none absolute top-5 right-3 z-10 text-xs text-muted-foreground/50 [:focus-within>&]:hidden">
							{hotkeyText} to hide
						</span>
					)}
					<PromptInput
						className="rounded-[13px] bg-background [&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
						onSubmit={handleSubmit}
						multiple
						maxFiles={5}
						maxFileSize={10 * 1024 * 1024}
						onKeyDown={(e) => {
							// Escape never closes the panel (⌘I is the only way to hide).
							// PTY forwarding can't key off defaultPrevented here:
							// ProseMirror preventDefaults every Escape whether or not a
							// popover consumed it, so that happens via onEscape below.
							if (e.key === "Escape") {
								e.stopPropagation();
							}
						}}
					>
						<PromptInputAttachments>
							{(file) => <PromptInputAttachment data={file} />}
						</PromptInputAttachments>
						<TiptapPromptEditor
							cwd={cwd}
							searchFiles={searchFiles}
							slashCommands={mergedSlashCommands}
							placeholder="Ask to make changes"
							// Claude Code's command semantics: a command only fires as the
							// first thing in the message, and picking an argument-less
							// command from the menu executes it immediately.
							slashOnlyAtStart
							submitCommandOnSelect
							// Fires only when no slash/mention popover was open to consume
							// Escape. Forward ESC so it acts like Escape typed in the
							// terminal (interrupts the agent, exits CLI menus); the panel
							// stays open and focused.
							onEscape={() => {
								terminalRuntimeRegistry.writeInput(
									terminalId,
									"\x1b",
									terminalInstanceId,
								);
							}}
						/>
						<PromptInputFooter>
							{isClaudeAgent ? (
								<TerminalComposerControls
									terminalId={terminalId}
									terminalInstanceId={terminalInstanceId}
									detectedModel={agentBinding?.model}
									detectedEffort={agentBinding?.effortLevel}
								/>
							) : (
								<span className="flex items-center pl-1">
									<TerminalPaneIcon
										workspaceId={workspaceId}
										terminalId={terminalId}
									/>
								</span>
							)}
							<span className="flex items-center gap-1.5">
								{agentBinding?.contextUsedTokens !== undefined && (
									<TerminalContextUsage
										usedTokens={agentBinding.contextUsedTokens}
										model={agentBinding.model}
									/>
								)}
								<AttachFileButton />
								<PromptInputSubmit className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20">
									<ArrowUpIcon className="size-3.5 text-muted-foreground" />
								</PromptInputSubmit>
							</span>
						</PromptInputFooter>
					</PromptInput>
				</div>
			</div>
		</div>
	);
}
