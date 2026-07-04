import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import { type Editor, Extension } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { History } from "@tiptap/extension-history";
import { Paragraph } from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import { Text } from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";
import { LuCornerDownLeft } from "react-icons/lu";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { prepareTerminalSubmission } from "./prepareTerminalSubmission";

interface TerminalRichInputProps {
	workspaceId: string;
	terminalId: string;
	terminalInstanceId: string;
	isOpen: boolean;
	onClose: () => void;
}

/**
 * Serialize the composer to plain text: paragraphs join with "\n", hard breaks
 * (Shift+Enter) become "\n". Kept local so this composer stays independent of
 * the chat editor's richer node set (file mentions / slash commands land in a
 * follow-up).
 */
function editorToText(editor: Editor): string {
	const lines: string[] = [];
	editor.state.doc.forEach((block) => {
		const parts: string[] = [];
		block.forEach((child) => {
			if (child.type.name === "hardBreak") parts.push("\n");
			else if (child.isText) parts.push(child.text ?? "");
		});
		lines.push(parts.join(""));
	});
	return lines.join("\n");
}

/**
 * Warp-style rich input overlay for a v2 terminal pane. Opens a multiline
 * composer over the terminal (⌘I), then submits the composed prompt into the
 * running agent's PTY via bracketed paste + carriage return, so a multiline
 * prompt arrives as a single block instead of executing line-by-line.
 */
export function TerminalRichInput({
	workspaceId,
	terminalId,
	terminalInstanceId,
	isOpen,
	onClose,
}: TerminalRichInputProps) {
	const bindings = useTerminalAgentBindings(workspaceId);
	const agentId = bindings.get(terminalId)?.agentId;
	const targetLabel = agentId ? BUILTIN_AGENT_LABELS[agentId] : "Terminal";

	// IME guard: Enter that commits a CJK/dead-key composition must not submit.
	const isComposingRef = useRef(false);
	// onClose is read from a ref so the once-built editor's Escape handler never
	// closes over a stale callback.
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	const submit = useCallback(
		(editor: Editor) => {
			const text = prepareTerminalSubmission(editorToText(editor));
			if (text === null) return;
			// Bracketed paste keeps the multiline block literal (CLI agents enable
			// the mode); the trailing "\r" then submits it as one prompt.
			terminalRuntimeRegistry.paste(terminalId, text, terminalInstanceId);
			terminalRuntimeRegistry.writeInput(terminalId, "\r", terminalInstanceId);
			terminalRuntimeRegistry.scrollToBottom(terminalId, terminalInstanceId);
			editor.commands.clearContent();
		},
		[terminalId, terminalInstanceId],
	);

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			Document,
			Text,
			Paragraph,
			HardBreak,
			History,
			Placeholder.configure({
				placeholder: "Compose a prompt — ↵ send · ⇧↵ newline · esc close",
			}),
			Extension.create({
				name: "terminalRichInputKeyboard",
				addKeyboardShortcuts() {
					return {
						Enter: () => {
							if (isComposingRef.current) return false;
							submit(this.editor);
							return true;
						},
						"Shift-Enter": () => this.editor.commands.setHardBreak(),
						Escape: () => {
							onCloseRef.current();
							return true;
						},
					};
				},
			}),
		],
		editorProps: {
			attributes: {
				class:
					"tiptap-chat-input max-h-40 overflow-y-auto text-sm leading-relaxed outline-none",
			},
			handleDOMEvents: {
				compositionstart: () => {
					isComposingRef.current = true;
					return false;
				},
				compositionend: () => {
					isComposingRef.current = false;
					return false;
				},
			},
		},
	});

	// Move focus into the composer when it opens; TerminalPane refocuses the
	// terminal on close.
	useEffect(() => {
		if (isOpen && editor) editor.commands.focus("end");
	}, [isOpen, editor]);

	if (!isOpen) return null;

	return (
		<div className="absolute inset-x-2 bottom-2 z-10 overflow-hidden rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12),0_2px_4px_-2px_rgba(0,0,0,0.06)]">
			<div className="px-3 py-2">
				<EditorContent editor={editor} />
			</div>
			<div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
				<span>
					Send to{" "}
					<span className="font-medium text-foreground">{targetLabel}</span>
				</span>
				<span className="flex items-center gap-1">
					<LuCornerDownLeft className="size-3" /> send · ⇧↵ newline · esc close
				</span>
			</div>
		</div>
	);
}
