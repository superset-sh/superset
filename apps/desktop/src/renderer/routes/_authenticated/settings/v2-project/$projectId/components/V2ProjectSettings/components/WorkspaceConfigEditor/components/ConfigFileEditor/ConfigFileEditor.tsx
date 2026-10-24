import { Trans, useLingui } from "@lingui/react/macro";
import { parseProjectConfig } from "@superset/shared/project-config";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export type ConfigFileFormat = "toml" | "json";

interface ConfigFileEditorProps {
	path: string;
	format: ConfigFileFormat;
	/** The file's text on disk; null when it does not exist yet. */
	savedContent: string | null;
	/** Shown in the editor when the file does not exist. */
	initialContent: string;
	note?: ReactNode;
	/** Replaces the editor's text without saving, e.g. a conversion to review. */
	pendingContent?: string | null;
	/** Gets the editor's current text, so an action works on unsaved edits. */
	actions?: (text: string) => ReactNode;
	isSaving: boolean;
	saveError: string | null;
	onSave: (content: string) => void;
}

interface Problem {
	line?: number;
	message: string;
}

function findProblems({
	format,
	content,
	notAnObjectMessage,
}: {
	format: ConfigFileFormat;
	content: string;
	notAnObjectMessage: string;
}): Problem[] {
	if (format === "toml") {
		const result = parseProjectConfig(content);
		return result.ok ? [] : result.errors;
	}
	try {
		const parsed: unknown = JSON.parse(content);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? []
			: [{ message: notAnObjectMessage }];
	} catch (error) {
		return [
			{ message: error instanceof Error ? error.message : String(error) },
		];
	}
}

export function ConfigFileEditor({
	path,
	format,
	savedContent,
	initialContent,
	note,
	pendingContent,
	actions,
	isSaving,
	saveError,
	onSave,
}: ConfigFileEditorProps) {
	const { t } = useLingui();
	const [text, setText] = useState(savedContent ?? initialContent);
	const syncedText = useRef(savedContent ?? initialContent);
	const submittedText = useRef<string | null>(null);

	// Typing after Save must survive the refresh that the save causes.
	useEffect(() => {
		const next = savedContent ?? initialContent;
		setText((current) =>
			current === syncedText.current || current === submittedText.current
				? next
				: current,
		);
		syncedText.current = next;
		submittedText.current = null;
	}, [savedContent, initialContent]);

	useEffect(() => {
		if (pendingContent != null) setText(pendingContent);
	}, [pendingContent]);

	const notAnObjectMessage = t({
		message: "config.json must be a JSON object",
	});
	const problems = useMemo(
		() => findProblems({ format, content: text, notAnObjectMessage }),
		[format, text, notAnObjectMessage],
	);
	const isDirty = text !== (savedContent ?? "");
	const canSave = isDirty && problems.length === 0 && !isSaving;
	const submit = () => {
		submittedText.current = text;
		onSave(text);
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<span className="truncate font-mono text-xs text-muted-foreground">
					{path}
				</span>
				<div className="flex shrink-0 items-center gap-2">
					{actions?.(text)}
					<Button size="sm" disabled={!canSave} onClick={submit}>
						{isSaving ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
					</Button>
				</div>
			</div>
			{note && <p className="text-xs text-muted-foreground">{note}</p>}
			<Textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === "s") {
						event.preventDefault();
						if (canSave) submit();
					}
				}}
				spellCheck={false}
				aria-label={t({ message: "Config file contents" })}
				className="min-h-72 font-mono text-xs leading-relaxed"
			/>
			{problems.length > 0 && (
				<ul className="flex flex-col gap-1 text-xs text-destructive">
					{problems.map((problem) => (
						<li key={`${problem.line ?? ""}:${problem.message}`}>
							{problem.line ? (
								<Trans>
									Line {problem.line}: {problem.message}
								</Trans>
							) : (
								problem.message
							)}
						</li>
					))}
				</ul>
			)}
			{saveError && <p className="text-xs text-destructive">{saveError}</p>}
		</div>
	);
}
