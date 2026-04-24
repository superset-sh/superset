/**
 * Shell / bash tool renderer. Scrollable monospace output with a copy
 * button. Ported from OpenCode's message-part.tsx shell branch.
 */

import type { ToolPart } from "@superset/chat/shared";
import { Terminal } from "lucide-react";
import { useCallback, useState } from "react";
import { BasicTool } from "../BasicTool";
import { ToolErrorCard } from "../ToolErrorCard";
import {
	extractShellOutput,
	inputAsRecord,
	isToolError,
	pickString,
	statusFromToolState,
	stripAnsi,
} from "../toolHelpers";

const DESCRIPTION_KEYS = ["description", "purpose"] as const;
const COMMAND_KEYS = ["command", "cmd"] as const;

export function ShellTool({ part }: { part: ToolPart }) {
	const input = inputAsRecord(part.state);
	const command = pickString(input, COMMAND_KEYS) ?? "";
	const description = pickString(input, DESCRIPTION_KEYS);

	if (isToolError(part) && part.state.kind === "error") {
		return (
			<ToolErrorCard
				tool="Shell"
				error={part.state.error.message}
				subtitle={command || undefined}
			/>
		);
	}

	const output =
		part.state.kind === "completed"
			? stripAnsi(extractShellOutput(part.state.output))
			: "";

	return (
		<BasicTool
			icon={Terminal}
			status={statusFromToolState(part.state)}
			defer
			trigger={{
				title: "Shell",
				subtitle: description ?? command,
			}}
		>
			<ShellContent command={command} output={output} />
		</BasicTool>
	);
}

function ShellContent({
	command,
	output,
}: {
	command: string;
	output: string;
}) {
	const text = output
		? `$ ${command}\n\n${output}`
		: command
			? `$ ${command}`
			: "";
	const [copied, setCopied] = useState(false);
	const onCopy = useCallback(() => {
		if (!text) return;
		void navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [text]);

	return (
		<div className="relative">
			<button
				type="button"
				onClick={onCopy}
				className="text-muted-foreground hover:text-foreground bg-background/70 absolute right-1 top-1 rounded px-1.5 py-0.5 text-[11px] opacity-0 transition-opacity group-hover/tool:opacity-100 hover:opacity-100"
				style={{ opacity: copied ? 1 : undefined }}
			>
				{copied ? "Copied!" : "Copy"}
			</button>
			<pre
				data-scrollable="true"
				className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed"
			>
				{text}
			</pre>
		</div>
	);
}
