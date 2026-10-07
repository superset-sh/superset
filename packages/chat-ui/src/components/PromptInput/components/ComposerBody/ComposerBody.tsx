"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { LexicalTypeaheadMenuPlugin } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { Trans, useLingui } from "@lingui/react/macro";
import { getClipboardFiles } from "@superset/ui/lib/clipboard-files";
import { cn } from "@superset/ui/utils";
import {
	$createNodeSelection,
	$createTextNode,
	$getNearestNodeFromDOMNode,
	$getRoot,
	$getSelection,
	$isNodeSelection,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	CLICK_COMMAND,
	COMMAND_PRIORITY_HIGH,
	COMMAND_PRIORITY_LOW,
	DROP_COMMAND,
	KEY_BACKSPACE_COMMAND,
	KEY_DELETE_COMMAND,
	KEY_ENTER_COMMAND,
	KEY_ESCAPE_COMMAND,
	type LexicalNode,
	PASTE_COMMAND,
} from "lexical";
import {
	ArrowUpIcon,
	MicIcon,
	PaperclipIcon,
	RefreshCcwIcon,
	SquareIcon,
	XIcon,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useComposerDropZone } from "../../../ComposerDropZone";
import { useDictation } from "../../hooks/useDictation";
import {
	type MentionSection,
	useMentionSources,
} from "../../hooks/useMentionSources";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type {
	ComposerActionContext,
	ComposerChip,
	ComposerMentionEntry,
	ComposerPanelContent,
	PromptInputAttachment,
	PromptInputProps,
} from "../../types";
import { registerHistoryNavigation } from "../../utils/historyNavigation";
import { matchToken } from "../../utils/matchToken";
import { rankCommands } from "../../utils/rankCommands";
import {
	CommandTypeaheadOption,
	MentionTypeaheadOption,
} from "../../utils/typeaheadOptions";
import { AttachmentPills } from "../AttachmentPills";
import { CommandMenu } from "../CommandMenu";
import { ComposerPanel } from "../ComposerPanel";
import { ContextButton } from "../ContextButton";
import { DictationBar } from "../DictationBar";
import { MentionMenu } from "../MentionMenu";

const FOOTER_BUTTON_CLASS =
	"flex size-[26px] shrink-0 items-center justify-center rounded-md transition-colors";
const GHOST_FOOTER_BUTTON_CLASS = cn(
	FOOTER_BUTTON_CLASS,
	"cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground",
);
const FILLED_FOOTER_BUTTON_CLASS = cn(
	FOOTER_BUTTON_CLASS,
	"cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80",
);
const INACTIVE_SEND_BUTTON_CLASS = cn(
	FOOTER_BUTTON_CLASS,
	"cursor-not-allowed bg-secondary text-muted-foreground",
);

// Slash commands only trigger while the "/token" is the entire message.
function matchCommandToken(text: string) {
	const match = /^\/([^/\r\n]*)$/.exec(text);
	if (!match) return null;
	return {
		leadOffset: 0,
		matchingString: match[1] ?? "",
		replaceableString: match[0],
	};
}

export type ComposerBodyProps = Required<
	Pick<
		PromptInputProps,
		"placeholder" | "status" | "submitWhileStreaming" | "placement"
	>
> &
	Pick<
		PromptInputProps,
		| "mentionProviders"
		| "commands"
		| "dictation"
		| "toolbar"
		| "toolbarEnd"
		| "defaultValue"
		| "onChange"
		| "onSubmit"
		| "onStop"
		| "onMentionHighlight"
		| "onAttachmentClick"
		| "onChipClick"
		| "ref"
		| "header"
		| "onAddFiles"
		| "allowEmptySubmit"
		| "clearOnSubmit"
		| "hideSubmit"
		| "autoFocus"
		| "history"
	>;

function $insertChipAtSelection(chip: ComposerChip) {
	let selection = $getSelection();
	if (!$isRangeSelection(selection)) {
		$getRoot().selectEnd();
		selection = $getSelection();
	}
	if (!$isRangeSelection(selection)) return;
	const chipNode = MentionChipNode.fromChip(chip);
	selection.insertNodes([chipNode, $createTextNode(" ")]);
}

function $collectChips(): ComposerChip[] {
	const chips: ComposerChip[] = [];
	const visit = (node: LexicalNode) => {
		if (node instanceof MentionChipNode) {
			chips.push(node.toChip());
		}
		if ("getChildren" in node) {
			for (const child of (
				node as unknown as { getChildren(): LexicalNode[] }
			).getChildren()) {
				visit(child);
			}
		}
	};
	visit($getRoot());
	return chips;
}

export function ComposerBody({
	placeholder,
	mentionProviders,
	commands,
	dictation,
	status,
	submitWhileStreaming,
	placement,
	toolbar,
	toolbarEnd,
	defaultValue,
	onChange,
	onSubmit,
	onStop,
	onMentionHighlight,
	onAttachmentClick,
	onChipClick,
	ref,
	header,
	onAddFiles,
	allowEmptySubmit,
	clearOnSubmit,
	hideSubmit,
	autoFocus,
	history,
}: ComposerBodyProps) {
	const { t } = useLingui();
	const [editor] = useLexicalComposerContext();
	const focusAtEnd = useCallback(() => {
		editor.update(() => $getRoot().selectEnd());
		editor.focus();
	}, [editor]);
	useImperativeHandle(
		ref,
		() => ({
			appendText(text: string) {
				editor.update(() => {
					const root = $getRoot();
					const separator = root.getTextContent().trim() === "" ? "" : "\n";
					root.selectEnd();
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						selection.insertRawText(`${separator}${text}`);
					}
				});
				editor.focus();
			},
			openFileDialog() {
				fileInputRef.current?.click();
			},
			focus() {
				focusAtEnd();
			},
		}),
		[editor, focusAtEnd],
	);
	const [attachments, setAttachments] = useState<PromptInputAttachment[]>([]);
	const [isEmpty, setIsEmpty] = useState(true);
	const [dragging, setDragging] = useState(false);
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [commandQuery, setCommandQuery] = useState<string | null>(null);
	const [commandDismissed, setCommandDismissed] = useState(false);
	const [panel, setPanel] = useState<ComposerPanelContent | null>(null);
	const [menuSlot, setMenuSlot] = useState<HTMLDivElement | null>(null);
	const [browseOpen, setBrowseOpen] = useState(false);
	const [browseIndex, setBrowseIndex] = useState(0);
	const [typeaheadDismissed, setTypeaheadDismissed] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	// Lexical command listeners register once; this ref bridges them to live React state.
	const stateRef = useRef({
		attachments,
		onChipClick,
		onStop,
		onSubmit,
		status,
		submitWhileStreaming,
		allowEmptySubmit,
		clearOnSubmit,
		history,
	});
	stateRef.current = {
		attachments,
		onChipClick,
		onStop,
		onSubmit,
		status,
		submitWhileStreaming,
		allowEmptySubmit,
		clearOnSubmit,
		history,
	};
	const historyNavigationRef = useRef<{ reset: () => void } | null>(null);

	// A draft the host had stored. Read once: after mount the editor is the
	// only writer, and re-applying would fight what is being typed.
	const seeded = useRef(false);
	useEffect(() => {
		if (seeded.current) return;
		seeded.current = true;
		if (!defaultValue) return;
		editor.update(() => {
			const root = $getRoot();
			if (root.getTextContent() !== "") return;
			root.selectEnd();
			const selection = $getSelection();
			if ($isRangeSelection(selection)) selection.insertText(defaultValue);
		});
	}, [defaultValue, editor]);

	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	useEffect(
		() =>
			editor.registerUpdateListener(({ editorState }) => {
				const text = editorState.read(() => $getRoot().getTextContent());
				onChangeRef.current?.(text);
			}),
		[editor],
	);

	const addFiles = (files: FileList | File[]) => {
		const incoming = Array.from(files);
		if (incoming.length === 0) return;
		if (onAddFiles) {
			onAddFiles(incoming);
			return;
		}
		setAttachments((previous) => [
			...previous,
			...incoming.map((file) => ({
				id: crypto.randomUUID(),
				file,
				previewUrl:
					file.type.startsWith("image/") || file.type.startsWith("video/")
						? URL.createObjectURL(file)
						: undefined,
			})),
		]);
	};
	const addFilesRef = useRef(addFiles);
	addFilesRef.current = addFiles;

	const dropZone = useComposerDropZone();
	useEffect(() => {
		return dropZone?.register((files) => addFilesRef.current(files));
	}, [dropZone]);

	const actionContext: ComposerActionContext = {
		insertChip: (chip) => {
			editor.update(() => $insertChipAtSelection(chip));
		},
		attachFiles: () => fileInputRef.current?.click(),
		openPanel: setPanel,
		query: mentionQuery ?? "",
	};
	const actionContextRef = useRef(actionContext);
	actionContextRef.current = actionContext;

	const sections = useMentionSources(
		mentionProviders ?? [],
		mentionQuery != null || browseOpen,
		mentionQuery ?? "",
	);
	const browseSections = useMemo<MentionSection[]>(
		() => [
			{
				providerId: "add",
				title: t({ message: "Add" }),
				isLoading: false,
				entries: [
					{
						id: "attach-files",
						label: t({ message: "Attach files" }),
						icon: <PaperclipIcon className="size-4" />,
						select: (ctx) => ctx.attachFiles(),
					},
				],
			},
			...sections.filter((section) => section.entries.length > 0),
		],
		[sections, t],
	);
	const browseEntries = useMemo(
		() => browseSections.flatMap((section) => section.entries),
		[browseSections],
	);

	useEffect(() => {
		setTypeaheadDismissed(false);
		// The two menu modes are mutually exclusive: typing "@" replaces browse.
		if (mentionQuery != null) setBrowseOpen(false);
	}, [mentionQuery]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset dismissal whenever the token changes
	useEffect(() => {
		setCommandDismissed(false);
	}, [commandQuery]);
	const mentionOptions = useMemo(
		() =>
			sections.flatMap((section) =>
				section.entries.map((entry) => new MentionTypeaheadOption(entry)),
			),
		[sections],
	);

	const rankedCommands = useMemo(
		() => rankCommands(commands ?? [], commandQuery ?? ""),
		[commands, commandQuery],
	);
	const commandOptions = useMemo(
		() => rankedCommands.map((command) => new CommandTypeaheadOption(command)),
		[rankedCommands],
	);

	const selectMentionEntry = (
		entry: ComposerMentionEntry,
		nodeToReplace: LexicalNode | null,
		closeMenu: () => void,
	) => {
		if (entry.completionQuery != null) {
			const completion = entry.completionQuery;
			editor.update(() => {
				if (nodeToReplace && "setTextContent" in nodeToReplace) {
					const textNode = nodeToReplace as unknown as {
						setTextContent(text: string): void;
						select(anchor: number, focus: number): void;
					};
					const text = `@${completion}`;
					textNode.setTextContent(text);
					textNode.select(text.length, text.length);
				}
			});
			return;
		}
		editor.update(() => {
			nodeToReplace?.remove();
			closeMenu();
		});
		void entry.select(actionContextRef.current);
	};

	useEffect(() => {
		if (mentionQuery == null) onMentionHighlight?.(null);
	}, [mentionQuery, onMentionHighlight]);

	const releaseAttachment = (attachment: PromptInputAttachment) => {
		if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
	};

	const submit = ({ steer = false }: { steer?: boolean } = {}) => {
		if (
			stateRef.current.status === "streaming" &&
			!stateRef.current.submitWhileStreaming
		)
			return;
		const { text, mentions } = editor.getEditorState().read(() => ({
			text: $getRoot().getTextContent().trim(),
			mentions: $collectChips(),
		}));
		const files = stateRef.current.attachments.map(
			(attachment) => attachment.file,
		);
		if (!text && files.length === 0 && !stateRef.current.allowEmptySubmit) {
			return;
		}
		stateRef.current.onSubmit?.({ text, files, mentions, steer });
		historyNavigationRef.current?.reset();
		if (!stateRef.current.clearOnSubmit) return;
		editor.update(() => $getRoot().clear());
		setAttachments((previous) => {
			for (const attachment of previous) releaseAttachment(attachment);
			return [];
		});
		setPanel(null);
	};
	const submitRef = useRef(submit);
	submitRef.current = submit;

	const dictationSession = useDictation({
		transcribe: (audio) => dictation?.transcribe(audio) ?? "",
		onError: (dictationError) => dictation?.onError?.(dictationError),
		onTranscript: (text) => {
			editor.update(() => {
				$getRoot().selectEnd();
				const selection = $getSelection();
				if (!$isRangeSelection(selection)) return;
				const anchorNode = selection.anchor.getNode();
				const offset = selection.anchor.offset;
				const previousChar = $isTextNode(anchorNode)
					? anchorNode.getTextContent()[offset - 1]
					: undefined;
				const needsSpace = previousChar != null && !/\s/.test(previousChar);
				selection.insertText(needsSpace ? ` ${text}` : text);
			});
		},
	});

	useEffect(() => {
		const unregisterText = editor.registerTextContentListener((text) =>
			setIsEmpty(text.trim().length === 0),
		);
		const unregisterEnter = editor.registerCommand<KeyboardEvent | null>(
			KEY_ENTER_COMMAND,
			(event) => {
				if (event?.shiftKey || event?.isComposing || event?.keyCode === 229)
					return false;
				event?.preventDefault();
				submitRef.current({
					steer: Boolean(event?.metaKey || event?.ctrlKey),
				});
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const historyNavigation = registerHistoryNavigation(
			editor,
			() => stateRef.current.history ?? [],
		);
		historyNavigationRef.current = historyNavigation;
		const unregisterEscape = editor.registerCommand<KeyboardEvent | null>(
			KEY_ESCAPE_COMMAND,
			(event) => {
				const { status, onStop } = stateRef.current;
				if (status !== "streaming" || !onStop) return false;
				event?.preventDefault();
				onStop();
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const unregisterDrop = editor.registerCommand<DragEvent>(
			DROP_COMMAND,
			(event) => {
				const files = event.dataTransfer?.files;
				if (files && files.length > 0) {
					event.preventDefault();
					addFilesRef.current(files);
					setDragging(false);
					return true;
				}
				return false;
			},
			COMMAND_PRIORITY_HIGH,
		);
		const unregisterPaste = editor.registerCommand<ClipboardEvent>(
			PASTE_COMMAND,
			(event) => {
				if (!(event instanceof ClipboardEvent)) return false;
				const files = getClipboardFiles(event.clipboardData);
				if (files.length > 0) {
					event.preventDefault();
					addFilesRef.current(files);
					return true;
				}
				return false;
			},
			COMMAND_PRIORITY_HIGH,
		);
		// Chips are decorator nodes: clicks select them as a node selection (and
		// notify the app), and Backspace/Delete remove the selected chips.
		const unregisterClick = editor.registerCommand<MouseEvent>(
			CLICK_COMMAND,
			(event) => {
				const target = event.target;
				if (!(target instanceof Element)) return false;
				const chipElement = target.closest("[data-mention-chip]");
				if (!chipElement) return false;
				const node = $getNearestNodeFromDOMNode(chipElement);
				if (!(node instanceof MentionChipNode)) return false;
				const selection = $createNodeSelection();
				selection.add(node.getKey());
				$setSelection(selection);
				stateRef.current.onChipClick?.(node.toChip());
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const removeSelectedChips = (event: KeyboardEvent | null) => {
			const selection = $getSelection();
			if (!$isNodeSelection(selection)) return false;
			const nodes = selection.getNodes();
			if (
				nodes.length === 0 ||
				!nodes.every((node) => node instanceof MentionChipNode)
			)
				return false;
			event?.preventDefault();
			for (const node of nodes) node.remove();
			return true;
		};
		const unregisterBackspace = editor.registerCommand<KeyboardEvent | null>(
			KEY_BACKSPACE_COMMAND,
			removeSelectedChips,
			COMMAND_PRIORITY_LOW,
		);
		const unregisterDelete = editor.registerCommand<KeyboardEvent | null>(
			KEY_DELETE_COMMAND,
			removeSelectedChips,
			COMMAND_PRIORITY_LOW,
		);
		return () => {
			unregisterText();
			unregisterEnter();
			historyNavigation.unregister();
			unregisterEscape();
			unregisterDrop();
			unregisterPaste();
			unregisterClick();
			unregisterBackspace();
			unregisterDelete();
		};
	}, [editor]);

	const toggleBrowseMenu = () => {
		setTypeaheadDismissed(true);
		setBrowseIndex(0);
		setBrowseOpen((previous) => !previous);
	};

	const selectBrowseEntry = (entry: ComposerMentionEntry) => {
		setBrowseOpen(false);
		if (entry.completionQuery != null) {
			const completion = entry.completionQuery;
			editor.focus();
			editor.update(() => {
				let selection = $getSelection();
				if (!$isRangeSelection(selection)) {
					$getRoot().selectEnd();
					selection = $getSelection();
				}
				if (!$isRangeSelection(selection)) return;
				const anchorNode = selection.anchor.getNode();
				const offset = selection.anchor.offset;
				const previousChar = $isTextNode(anchorNode)
					? anchorNode.getTextContent()[offset - 1]
					: undefined;
				const needsSpace =
					(previousChar != null && !/\s/.test(previousChar)) ||
					(!$isTextNode(anchorNode) && offset > 0);
				selection.insertText(needsSpace ? ` @${completion}` : `@${completion}`);
			});
			return;
		}
		void entry.select(actionContextRef.current);
	};

	// Escape aborts dictation without transcribing; it outranks every other
	// Escape behavior while a recording or failed transcription is active.
	useEffect(() => {
		if (
			dictationSession.status !== "recording" &&
			dictationSession.status !== "error"
		)
			return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			dictationSession.cancel();
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () =>
			window.removeEventListener("keydown", onKeyDown, { capture: true });
	});

	// Browse-mode keyboard: the editor may not be focused, so listen globally.
	useEffect(() => {
		if (!browseOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const delta = event.key === "ArrowDown" ? 1 : -1;
				setBrowseIndex((previous) => {
					const count = browseEntries.length;
					return count === 0 ? 0 : (previous + delta + count) % count;
				});
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				const entry = browseEntries[browseIndex];
				if (entry) selectBrowseEntry(entry);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setBrowseOpen(false);
			}
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () =>
			window.removeEventListener("keydown", onKeyDown, { capture: true });
	});

	// Any pointer press outside the composer and its menus dismisses both
	// modes; a press on the editor itself closes browse (typing intent).
	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (target && rootRef.current?.contains(target)) {
				if (
					target instanceof Element &&
					target.closest(".prompt-input-editor")
				) {
					setBrowseOpen(false);
				}
				return;
			}
			setBrowseOpen(false);
			setTypeaheadDismissed(true);
			setCommandDismissed(true);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, []);

	const canSend = allowEmptySubmit || !isEmpty || attachments.length > 0;

	useEffect(() => {
		if (autoFocus) focusAtEnd();
	}, [autoFocus, focusAtEnd]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target; keyboard users attach via the file picker button
		<div
			ref={rootRef}
			className={cn(
				"relative flex flex-col rounded-2xl bg-card ring-1 ring-border transition-shadow focus-within:ring-ring/40",
			)}
			onDragOver={(event) => {
				if (dropZone == null && event.dataTransfer.types.includes("Files")) {
					event.preventDefault();
					setDragging(true);
				}
			}}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null))
					setDragging(false);
			}}
			onDrop={(event) => {
				// The editor's DROP_COMMAND handler may have consumed this already;
				// preventDefault marks it and the event still bubbles here. Inside a
				// layout ComposerDropZone the zone owns non-editor drops instead.
				if (
					dropZone == null &&
					!event.defaultPrevented &&
					event.dataTransfer.files.length > 0
				) {
					event.preventDefault();
					addFiles(event.dataTransfer.files);
				}
				setDragging(false);
			}}
		>
			<div
				ref={setMenuSlot}
				className={cn(
					"pointer-events-none absolute inset-x-0 [&>*]:pointer-events-auto",
					placement === "bottom" ? "top-full pt-2" : "bottom-full pb-2",
				)}
			>
				{browseOpen && (
					<MentionMenu
						sections={browseSections}
						className="max-w-80"
						selectedIndex={browseIndex}
						onHighlight={setBrowseIndex}
						onSelectionChange={onMentionHighlight}
						onSelect={selectBrowseEntry}
					/>
				)}
			</div>
			{panel && (
				<ComposerPanel
					title={panel.title}
					placement={placement}
					onClose={() => setPanel(null)}
				>
					{panel.render()}
				</ComposerPanel>
			)}
			<div
				aria-hidden={!dragging}
				className={cn(
					"pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/10 transition-opacity duration-150 motion-reduce:transition-none",
					dragging ? "opacity-100" : "opacity-0",
				)}
			>
				<span
					className={cn(
						"inline-flex items-center rounded-md border border-border/50 bg-secondary px-3 py-1 text-sm text-foreground shadow transition-transform duration-150 motion-reduce:transition-none",
						dragging ? "scale-100" : "scale-95",
					)}
				>
					<Trans>Drop to attach</Trans>
				</span>
			</div>
			{header}
			<AttachmentPills
				attachments={attachments}
				onAttachmentClick={onAttachmentClick}
				onPreviewError={(id) =>
					setAttachments((previous) =>
						previous.map((entry) => {
							if (entry.id !== id || !entry.previewUrl) return entry;
							URL.revokeObjectURL(entry.previewUrl);
							return { ...entry, previewUrl: undefined };
						}),
					)
				}
				onRemove={(id) =>
					setAttachments((previous) =>
						previous.filter((entry) => {
							if (entry.id !== id) return true;
							releaseAttachment(entry);
							return false;
						}),
					)
				}
			/>
			<div className="relative px-4 pt-3.5 pb-1">
				<PlainTextPlugin
					contentEditable={
						<ContentEditable
							className="prompt-input-editor"
							spellCheck={false}
						/>
					}
					placeholder={
						<span className="pointer-events-none absolute top-3.5 left-4 text-sm leading-[1.625] text-muted-foreground/70">
							{placeholder}
						</span>
					}
					ErrorBoundary={LexicalErrorBoundary}
				/>
				<HistoryPlugin />
				<LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
					onQueryChange={setMentionQuery}
					onSelectOption={(option, nodeToReplace, closeMenu) =>
						selectMentionEntry(option.entry, nodeToReplace, closeMenu)
					}
					options={mentionOptions}
					triggerFn={(text) => matchToken(text, "@")}
					commandPriority={COMMAND_PRIORITY_HIGH}
					onClose={() => setMentionQuery(null)}
					menuRenderFn={(
						anchorElementRef,
						{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
					) =>
						anchorElementRef.current && menuSlot && !typeaheadDismissed
							? createPortal(
									<MentionMenu
										sections={sections}
										selectedIndex={selectedIndex}
										onHighlight={setHighlightedIndex}
										onSelectionChange={onMentionHighlight}
										onSelect={(entry) => {
											const option = mentionOptions.find(
												(candidate) => candidate.entry.id === entry.id,
											);
											if (option) selectOptionAndCleanUp(option);
										}}
									/>,
									menuSlot,
								)
							: null
					}
				/>
				<LexicalTypeaheadMenuPlugin<CommandTypeaheadOption>
					onQueryChange={setCommandQuery}
					onSelectOption={(option, nodeToReplace, closeMenu) => {
						editor.update(() => {
							nodeToReplace?.remove();
							closeMenu();
						});
						void option.command.onSelect(actionContextRef.current);
					}}
					options={commandOptions}
					triggerFn={(text) => matchCommandToken(text)}
					commandPriority={COMMAND_PRIORITY_HIGH}
					menuRenderFn={(
						anchorElementRef,
						{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
					) =>
						anchorElementRef.current &&
						menuSlot &&
						!commandDismissed &&
						rankedCommands.length > 0
							? createPortal(
									<CommandMenu
										commands={rankedCommands}
										selectedIndex={selectedIndex}
										onHighlight={setHighlightedIndex}
										onSelect={(command) => {
											const option = commandOptions.find(
												(candidate) => candidate.command.id === command.id,
											);
											if (option) selectOptionAndCleanUp(option);
										}}
									/>,
									menuSlot,
								)
							: null
					}
				/>
			</div>
			<div className="flex min-h-12 items-center gap-2 px-3 pb-2.5">
				<ContextButton
					onClick={toggleBrowseMenu}
					disabled={dictationSession.status !== "idle"}
				/>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="hidden"
					onChange={(event) => {
						if (event.target.files) addFiles(event.target.files);
						event.target.value = "";
					}}
				/>
				{dictationSession.status === "error" ? (
					<>
						<span className="min-w-0 flex-1 truncate pl-1 text-sm text-muted-foreground">
							{dictationSession.error?.message}
						</span>
						<button
							type="button"
							aria-label={t({
								message: "Retry dictation",
							})}
							onClick={() => void dictationSession.retry()}
							className={FILLED_FOOTER_BUTTON_CLASS}
						>
							<RefreshCcwIcon className="size-3.5" />
						</button>
						<button
							type="button"
							aria-label={t({
								message: "Discard recording",
							})}
							onClick={dictationSession.cancel}
							className={GHOST_FOOTER_BUTTON_CLASS}
						>
							<XIcon className="size-3.5" />
						</button>
						<button
							type="button"
							aria-label={t({
								message: "Send message",
							})}
							disabled
							className={INACTIVE_SEND_BUTTON_CLASS}
						>
							<ArrowUpIcon className="size-4" />
						</button>
					</>
				) : dictationSession.status !== "idle" ? (
					<>
						<DictationBar
							canvasRef={dictationSession.canvasRef}
							seconds={dictationSession.seconds}
						/>
						<button
							type="button"
							aria-label={t({
								message: "Stop dictation",
							})}
							disabled={dictationSession.status === "transcribing"}
							onClick={() => void dictationSession.finish()}
							className={cn(
								FILLED_FOOTER_BUTTON_CLASS,
								"disabled:cursor-default disabled:opacity-50",
							)}
						>
							<SquareIcon className="size-3 fill-current" />
						</button>
						<button
							type="button"
							aria-label={t({
								message: "Send message",
							})}
							disabled
							className={INACTIVE_SEND_BUTTON_CLASS}
						>
							<ArrowUpIcon className="size-4" />
						</button>
					</>
				) : (
					<>
						{toolbar}
						<div className="flex-1" />
						{toolbarEnd}
						{dictation && status !== "streaming" && (
							<button
								type="button"
								aria-label={t({
									message: "Dictate",
								})}
								onClick={() => {
									setBrowseOpen(false);
									void dictationSession.start();
								}}
								className={GHOST_FOOTER_BUTTON_CLASS}
							>
								<MicIcon className="size-4" />
							</button>
						)}
						{hideSubmit ? null : status === "streaming" &&
							!(submitWhileStreaming && canSend) ? (
							<button
								type="button"
								aria-label={t({
									message: "Stop response",
								})}
								onClick={onStop}
								className={FILLED_FOOTER_BUTTON_CLASS}
							>
								<SquareIcon className="size-3 fill-current" />
							</button>
						) : (
							<button
								type="button"
								aria-label={t({
									message: "Send message",
								})}
								disabled={!canSend}
								onClick={() => submit()}
								className={
									canSend
										? cn(
												FOOTER_BUTTON_CLASS,
												"cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90",
											)
										: INACTIVE_SEND_BUTTON_CLASS
								}
							>
								<ArrowUpIcon className="size-4" />
							</button>
						)}
					</>
				)}
			</div>
		</div>
	);
}
