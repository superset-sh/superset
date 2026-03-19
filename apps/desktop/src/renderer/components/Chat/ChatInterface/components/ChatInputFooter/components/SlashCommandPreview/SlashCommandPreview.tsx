import { chatServiceTrpc } from "@superset/chat/client";
import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SlashCommandParamField } from "./components/SlashCommandParamField";
import {
	buildNextSlashInput,
	buildParamFields,
	extractUnresolvedNamedPlaceholders,
	getNamedValueMap,
	getPositionalValueMap,
	normalizeSlashPreviewInput,
	type ParamField,
	parseSlashInput,
	resolveSlashCommandDefinition,
} from "./slash-command-preview.model";

interface SlashCommandPreviewProps {
	cwd: string;
	slashCommands: Array<{
		name: string;
		aliases: string[];
		description: string;
		argumentHint: string;
	}>;
}

function resolveFieldValue(
	field: ParamField,
	namedValues: Map<string, string>,
	positionalValues: Map<number, string>,
): string {
	if (field.kind === "named") {
		return namedValues.get(field.namedKeyUpper ?? "") ?? "";
	}
	return positionalValues.get(field.positionalIndex ?? -1) ?? "";
}

function isRequiredField(
	field: ParamField,
	unresolvedKeys: Set<string>,
): boolean {
	if (field.kind !== "named") return field.required;
	return unresolvedKeys.has(field.namedKeyUpper ?? "");
}

export function SlashCommandPreview({
	cwd,
	slashCommands,
}: SlashCommandPreviewProps) {
	const { textInput } = usePromptInputController();
	const inputValue = textInput.value;
	const slashPreviewInput = normalizeSlashPreviewInput(inputValue);
	const parsedInput = useMemo(() => parseSlashInput(inputValue), [inputValue]);

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
	const unresolvedFieldKeys = useMemo(
		() => extractUnresolvedNamedPlaceholders(previewPrompt),
		[previewPrompt],
	);
	const unresolvedFieldKeySet = useMemo(
		() => new Set(unresolvedFieldKeys),
		[unresolvedFieldKeys],
	);

	const paramFields = useMemo(
		() =>
			buildParamFields({
				argumentHint: commandDefinition?.argumentHint ?? "",
				unresolvedFieldKeys,
				parsed: parsedInput,
			}),
		[commandDefinition?.argumentHint, unresolvedFieldKeys, parsedInput],
	);

	const namedValueMap = useMemo(
		() => getNamedValueMap(parsedInput),
		[parsedInput],
	);
	const positionalValueMap = useMemo(
		() => getPositionalValueMap(parsedInput),
		[parsedInput],
	);
	const showParamForm = Boolean(
		parsedInput &&
			commandDefinition &&
			paramFields.length > 0 &&
			debouncedSlashPreviewInput,
	);

	const handleFieldChange = useCallback(
		(field: ParamField, value: string) => {
			if (!parsedInput) return;
			const nextInput = buildNextSlashInput(parsedInput, field, value);
			if (nextInput !== textInput.value) {
				textInput.setInput(nextInput);
			}
		},
		[parsedInput, textInput],
	);

	if (!showParamForm || !parsedInput) return null;

	return (
		<div className="w-full px-3 pb-1">
			<div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2">
				<div className="mb-2 flex items-center gap-2 text-muted-foreground text-xs">
					<span className="flex size-5 shrink-0 items-center justify-center rounded bg-background font-mono text-xs">
						/
					</span>
					<span className="font-mono text-foreground/90">
						{parsedInput.commandName}
					</span>
					<span>{commandDescription || "Fill command parameters"}</span>
				</div>

				<div className="grid gap-2 sm:grid-cols-2">
					{paramFields.map((field) => {
						const value = resolveFieldValue(
							field,
							namedValueMap,
							positionalValueMap,
						);
						const required = isRequiredField(field, unresolvedFieldKeySet);

						return (
							<SlashCommandParamField
								field={field}
								key={field.id}
								onChange={(nextValue) => handleFieldChange(field, nextValue)}
								required={required}
								value={value}
							/>
						);
					})}
				</div>

				<div className="mt-2 space-y-1">
					<div className="text-[11px] text-muted-foreground uppercase tracking-wide">
						Prompt Preview
					</div>
					<div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-border/70 bg-background/70 px-2 py-1.5 font-mono text-xs text-foreground/90">
						{previewPrompt}
					</div>
				</div>
			</div>
		</div>
	);
}
