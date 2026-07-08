import {
	PromptInput,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputProvider,
	PromptInputSubmit,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ArrowUpIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { TiptapPromptEditor } from "renderer/components/Chat/ChatInterface/components/TiptapPromptEditor/TiptapPromptEditor";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { TerminalPaneIcon } from "../TerminalPaneIcon";
import { prepareTerminalSubmission } from "./prepareTerminalSubmission";

interface TerminalRichInputProps {
	workspaceId: string;
	terminalId: string;
	terminalInstanceId: string;
	isOpen: boolean;
	onClose: () => void;
}

/**
 * Unsent drafts keyed by terminalId, module-scoped so a draft survives the
 * pane being re-pointed at another terminal (session dropdown, tab switch
 * reusing the mounted pane) and comes back when the user returns. Entries are
 * small strings; no eviction needed for a session's lifetime.
 */
const draftsByTerminalId = new Map<string, string>();

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
	onClose,
}: TerminalRichInputProps) {
	const controller = usePromptInputController();
	const hotkeyText = useHotkeyDisplay("TOGGLE_TERMINAL_RICH_INPUT").text;

	// Deduped with the page-level workspace.get query; provides the cwd the
	// mention popover uses to shorten paths.
	const { data: workspaceStatus } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ refetchOnWindowFocus: false, retry: false },
	);
	const cwd = workspaceStatus?.worktreePath ?? "";

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
		(message: PromptInputMessage) => {
			const text = prepareTerminalSubmission(message.text);
			if (text === null) return;
			// Bracketed paste keeps the multiline block literal (CLI agents enable
			// the mode); the trailing "\r" then submits it as one prompt.
			terminalRuntimeRegistry.paste(terminalId, text, terminalInstanceId);
			terminalRuntimeRegistry.writeInput(terminalId, "\r", terminalInstanceId);
			terminalRuntimeRegistry.scrollToBottom(terminalId, terminalInstanceId);
			controller.textInput.clear();
		},
		[terminalId, terminalInstanceId, controller],
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
	const rootRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;
		const attempt = (triesLeft: number) => {
			if (cancelled || triesLeft <= 0) return;
			controller.textInput.focus();
			requestAnimationFrame(() => {
				if (cancelled) return;
				const root = rootRef.current;
				if (root?.contains(document.activeElement)) return;
				attempt(triesLeft - 1);
			});
		};
		attempt(30);
		return () => {
			cancelled = true;
		};
	}, [isOpen, controller]);

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
			<div
				ref={rootRef}
				inert={!isOpen || undefined}
				className={cn(
					"min-h-0 overflow-hidden transition-opacity duration-150 ease-out",
					isOpen ? "opacity-100" : "pointer-events-none opacity-0",
				)}
			>
				{/* Pane root pads p-2 (8px); pt-2 sets the gap to the terminal and
				    the mx-auto max-w keeps the card centered like the chat composer. */}
				<div className="relative mx-auto w-full max-w-[680px] pt-2">
					{hotkeyText !== "Unassigned" && (
						<span className="pointer-events-none absolute top-5 right-3 z-10 text-xs text-muted-foreground/50">
							{hotkeyText} to hide
						</span>
					)}
					<PromptInput
						className="rounded-[13px] bg-background [&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
						onSubmit={handleSubmit}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								e.stopPropagation();
								onClose();
							}
						}}
					>
						<TiptapPromptEditor
							cwd={cwd}
							searchFiles={searchFiles}
							slashCommands={[]}
							placeholder="Ask to make changes"
						/>
						<PromptInputFooter>
							<span className="flex items-center pl-1">
								<TerminalPaneIcon
									workspaceId={workspaceId}
									terminalId={terminalId}
								/>
							</span>
							<PromptInputSubmit className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20">
								<ArrowUpIcon className="size-3.5 text-muted-foreground" />
							</PromptInputSubmit>
						</PromptInputFooter>
					</PromptInput>
				</div>
			</div>
		</div>
	);
}
