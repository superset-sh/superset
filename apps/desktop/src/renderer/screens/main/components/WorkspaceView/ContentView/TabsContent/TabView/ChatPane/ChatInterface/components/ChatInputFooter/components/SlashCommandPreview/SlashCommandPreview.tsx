import { chatServiceTrpc } from "@superset/chat/client";
import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import { useEffect, useState } from "react";

interface SlashCommandPreviewProps {
	cwd: string;
}

function normalizeSlashPreviewInput(input: string): string {
	const trimmed = input.trim();
	return trimmed.startsWith("/") ? trimmed : "";
}

export function SlashCommandPreview({ cwd }: SlashCommandPreviewProps) {
	const { textInput } = usePromptInputController();
	const inputValue = textInput.value;
	const slashPreviewInput = normalizeSlashPreviewInput(inputValue);
	const [debouncedSlashPreviewInput, setDebouncedSlashPreviewInput] =
		useState("");

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedSlashPreviewInput(slashPreviewInput);
		}, 120);

		return () => clearTimeout(timeout);
	}, [slashPreviewInput]);

	const { data: slashPreview } =
		chatServiceTrpc.workspace.previewSlashCommand.useQuery(
			{
				cwd,
				text: debouncedSlashPreviewInput,
			},
			{
				enabled: debouncedSlashPreviewInput.length > 1 && !!cwd,
				staleTime: 250,
				placeholderData: (previous) => previous,
			},
		);

	const previewPrompt = (slashPreview?.prompt ?? "").trim();
	const showSlashPreview = Boolean(
		debouncedSlashPreviewInput &&
			slashPreview?.handled &&
			previewPrompt.length > 0,
	);
	if (!showSlashPreview) return null;

	return (
		<div className="mx-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs">
			<div className="mb-1 flex items-center gap-2 text-muted-foreground">
				<span className="font-medium">Slash Preview</span>
				<span className="font-mono">{debouncedSlashPreviewInput}</span>
			</div>
			<div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-foreground/90">
				{previewPrompt}
			</div>
		</div>
	);
}
