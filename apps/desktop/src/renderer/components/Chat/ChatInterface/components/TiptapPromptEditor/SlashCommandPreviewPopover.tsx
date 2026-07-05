import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import type { Editor } from "@tiptap/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import {
	normalizeSlashPreviewInput,
	parseSlashInput,
	resolveSlashCommandDefinition,
} from "../ChatInputFooter/components/SlashCommandPreview/slash-command-preview.model";

export type SlashPreviewResult = {
	commandName?: string;
	prompt?: string;
} | null;

export type PreviewSlashCommandFn = (
	text: string,
) => Promise<SlashPreviewResult>;

interface SlashCommandPreviewPopoverProps {
	cwd: string;
	previewSlashCommand: PreviewSlashCommandFn;
	slashCommands: Array<{
		name: string;
		aliases: string[];
		description: string;
		argumentHint: string;
	}>;
	editor: Editor;
	isFocused: boolean;
}

export function SlashCommandPreviewPopover({
	cwd,
	previewSlashCommand,
	slashCommands,
	editor,
	isFocused,
}: SlashCommandPreviewPopoverProps) {
	const { textInput } = usePromptInputController();
	const inputValue = textInput.value;

	const anchorRef = useRef<HTMLDivElement>(null);

	// Position the virtual anchor over the slash-command chip in the editor.
	// biome-ignore lint/correctness/useExhaustiveDependencies: inputValue re-measures anchor when typing shifts the chip's position
	useLayoutEffect(() => {
		const el = anchorRef.current;
		if (!el) return;
		let foundPos: number | null = null;
		editor.state.doc.descendants((node, pos) => {
			if (node.type.name === "slash-command") {
				foundPos = pos;
				return false;
			}
		});
		if (foundPos === null) return;
		const dom = editor.view.nodeDOM(foundPos);
		if (!(dom instanceof HTMLElement)) return;
		const rect = dom.getBoundingClientRect();
		el.style.left = `${rect.left}px`;
		el.style.top = `${rect.top}px`;
		el.style.width = `${rect.width}px`;
		el.style.height = `${rect.height}px`;
	}, [editor, inputValue]);

	const slashPreviewInput = normalizeSlashPreviewInput(inputValue);
	const parsedInput = useMemo(() => parseSlashInput(inputValue), [inputValue]);
	const debouncedSlashPreviewInput = useDebouncedValue(slashPreviewInput, 120);

	const [slashPreview, setSlashPreview] = useState<SlashPreviewResult>(null);
	useEffect(() => {
		if (debouncedSlashPreviewInput.length <= 1 || !cwd) return;
		let cancelled = false;
		previewSlashCommand(debouncedSlashPreviewInput)
			.then((result) => {
				if (!cancelled) setSlashPreview(result);
			})
			.catch(() => {
				// Empty preview on error — popover degrades gracefully.
			});
		return () => {
			cancelled = true;
		};
	}, [cwd, debouncedSlashPreviewInput, previewSlashCommand]);

	const commandDefinition = useMemo(() => {
		if (!parsedInput?.commandName) return null;
		return resolveSlashCommandDefinition(
			slashCommands,
			parsedInput.commandName,
		);
	}, [parsedInput?.commandName, slashCommands]);

	const commandDescription = commandDefinition?.description?.trim() ?? "";
	const previewCommandName = slashPreview?.commandName?.toLowerCase();
	const canonicalCommandName = commandDefinition?.name.toLowerCase();
	const previewMatchesInputCommand = Boolean(
		previewCommandName &&
			canonicalCommandName &&
			previewCommandName === canonicalCommandName,
	);
	const previewPrompt = previewMatchesInputCommand
		? (slashPreview?.prompt ?? "")
		: "";

	// Show popover when there's an active command with a preview to display
	const showPopover = Boolean(
		parsedInput &&
			commandDefinition &&
			debouncedSlashPreviewInput &&
			previewPrompt,
	);

	return (
		<Popover open={showPopover && isFocused}>
			<PopoverAnchor asChild>
				<div
					ref={anchorRef}
					className="pointer-events-none fixed"
					aria-hidden="true"
				/>
			</PopoverAnchor>
			<PopoverContent
				side="top"
				align="start"
				sideOffset={8}
				className="w-72 p-3 text-xs"
				onOpenAutoFocus={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => e.preventDefault()}
				onMouseDown={(e) => e.preventDefault()}
			>
				<div className="mb-2 flex items-center gap-1.5">
					<span className="flex size-4.5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[11px]">
						/
					</span>
					<span className="font-mono text-foreground/90">
						{parsedInput?.commandName}
					</span>
					{commandDescription && (
						<span className="truncate text-muted-foreground/70">
							{commandDescription}
						</span>
					)}
				</div>
				<div className="space-y-1">
					<div className="text-[11px] uppercase tracking-wide text-muted-foreground/60">
						Prompt preview
					</div>
					<div className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded border border-border/60 bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-foreground/80">
						{previewPrompt}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
