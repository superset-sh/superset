"use client";

import { TerminalIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "../../lib/utils";
import { ToolCallRow } from "./tool-call-row";

type BashToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

type BashToolProps = {
	command?: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
	state: BashToolState;
	className?: string;
};

/** Extract first word of each command in a pipeline, max 4. */
function extractCommandSummary(command: string): string {
	const normalized = command.replace(/\\\s*\n\s*/g, " ");
	const parts = normalized.split(/\s*(?:&&|\|\||;|\|)\s*/);
	const firstWords = parts.map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
	const limited = firstWords.slice(0, 4);
	if (firstWords.length > 4) {
		return `${limited.join(", ")}...`;
	}
	return limited.join(", ");
}

export const BashTool = ({
	command,
	stdout,
	stderr,
	exitCode,
	state,
	className,
}: BashToolProps) => {
	const isPending = state === "input-streaming" || state === "input-available";
	const isError = exitCode !== undefined && exitCode !== 0;

	const commandSummary = useMemo(
		() => (command ? extractCommandSummary(command) : ""),
		[command],
	);

	const hasOutput = Boolean(command || stdout || stderr);

	return (
		<ToolCallRow
			className={className}
			description={commandSummary || undefined}
			icon={TerminalIcon}
			isError={isError}
			isPending={isPending}
			title="Bash"
		>
			{hasOutput ? (
				<div className="pl-2 py-1.5">
					{/* Command */}
					{command && (
						<div className="font-mono text-xs">
							<span className="text-amber-600 dark:text-amber-400">$ </span>
							<span className="whitespace-pre-wrap break-all text-foreground">
								{command}
							</span>
						</div>
					)}

					{/* Stdout */}
					{stdout && (
						<div className="mt-1.5 whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
							{stdout}
						</div>
					)}

					{/* Stderr */}
					{stderr && (
						<div
							className={cn(
								"mt-1.5 whitespace-pre-wrap break-all font-mono text-xs",
								exitCode === 0 || exitCode === undefined
									? "text-amber-600 dark:text-amber-400"
									: "text-rose-500 dark:text-rose-400",
							)}
						>
							{stderr}
						</div>
					)}
				</div>
			) : undefined}
		</ToolCallRow>
	);
};
