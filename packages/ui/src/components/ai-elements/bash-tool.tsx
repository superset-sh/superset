"use client";

import {
	CheckCircleIcon,
	ChevronDownIcon,
	TerminalIcon,
	XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Loader } from "./loader";
import { Shimmer } from "./shimmer";

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

/** Extract a short summary of the command for display in the header. */
function extractCommandSummary(command: string): string {
	const trimmed = command.trim();
	// For piped commands, show the first segment
	const firstSegment = trimmed.split(/\s*\|\s*/)[0] ?? trimmed;
	// Limit to first ~60 chars
	if (firstSegment.length > 60) {
		return `${firstSegment.slice(0, 57)}...`;
	}
	return firstSegment;
}

/** Limit text to N lines, returning whether it was truncated. */
function limitLines(
	text: string,
	maxLines: number,
): { text: string; truncated: boolean } {
	const lines = text.split("\n");
	if (lines.length <= maxLines) {
		return { text, truncated: false };
	}
	return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}

const MAX_COLLAPSED_LINES = 3;

const StatusIcon = ({
	state,
	exitCode,
}: {
	state: BashToolState;
	exitCode?: number;
}) => {
	if (state === "input-streaming" || state === "input-available") {
		return <Loader className="text-muted-foreground" size={14} />;
	}
	if (state === "output-error" || (exitCode !== undefined && exitCode !== 0)) {
		return <XCircleIcon className="size-3.5 text-red-500" />;
	}
	return <CheckCircleIcon className="size-3.5 text-green-500" />;
};

const HeaderText = ({
	state,
	command,
}: {
	state: BashToolState;
	command?: string;
}) => {
	if (state === "input-streaming") {
		return (
			<Shimmer as="span" className="text-xs">
				Running command...
			</Shimmer>
		);
	}
	if (state === "input-available") {
		return (
			<span className="text-muted-foreground text-xs">Running command...</span>
		);
	}
	if (!command) {
		return (
			<span className="text-muted-foreground text-xs">
				{state === "output-error" ? "Command failed" : "Ran command"}
			</span>
		);
	}
	const summary = extractCommandSummary(command);
	return (
		<span className="text-muted-foreground text-xs">
			{state === "output-error" ? "Failed:" : "Ran:"}{" "}
			<code className="font-mono text-foreground">{summary}</code>
		</span>
	);
};

export const BashTool = ({
	command,
	stdout,
	stderr,
	exitCode,
	state,
	className,
}: BashToolProps) => {
	const [expanded, setExpanded] = useState(false);

	const hasOutput = Boolean(stdout || stderr);
	const isStreaming = state === "input-streaming";
	const isPending = state === "input-available";

	return (
		<div
			className={cn(
				"not-prose mb-4 w-full overflow-hidden rounded-md border",
				className,
			)}
		>
			{/* Header */}
			<button
				className="flex w-full items-center gap-2 px-3 py-2"
				disabled={!hasOutput && !command}
				onClick={() => setExpanded((prev) => !prev)}
				type="button"
			>
				<TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
				<StatusIcon exitCode={exitCode} state={state} />
				<HeaderText command={command} state={state} />
				{(hasOutput || command) && (
					<ChevronDownIcon
						className={cn(
							"ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
							expanded && "rotate-180",
						)}
					/>
				)}
			</button>

			{/* Expandable body */}
			{expanded && (
				<div className="border-t bg-muted/30 px-3 py-2 font-mono text-xs">
					{/* Command */}
					{command && (
						<div className="flex gap-1.5">
							<span className="select-none text-amber-500">$</span>
							<pre className="whitespace-pre-wrap break-all">{command}</pre>
						</div>
					)}

					{/* stdout */}
					{stdout && (
						<OutputBlock
							exitCode={0}
							isStreaming={isStreaming || isPending}
							text={stdout}
						/>
					)}

					{/* stderr */}
					{stderr && (
						<OutputBlock
							exitCode={exitCode}
							isStreaming={isStreaming || isPending}
							text={stderr}
						/>
					)}
				</div>
			)}
		</div>
	);
};

const OutputBlock = ({
	text,
	exitCode,
	isStreaming,
}: {
	text: string;
	exitCode?: number;
	isStreaming: boolean;
}) => {
	const [showAll, setShowAll] = useState(false);
	const { text: limited, truncated } = limitLines(text, MAX_COLLAPSED_LINES);
	const isError = exitCode !== undefined && exitCode !== 0;

	return (
		<div className="mt-1.5">
			<pre
				className={cn(
					"whitespace-pre-wrap break-all",
					isError ? "text-rose-400" : "text-muted-foreground",
				)}
			>
				{showAll ? text : limited}
			</pre>
			{truncated && !showAll && (
				<button
					className="mt-1 text-muted-foreground/70 text-xs hover:text-muted-foreground"
					onClick={(e) => {
						e.stopPropagation();
						setShowAll(true);
					}}
					type="button"
				>
					Show all ({text.split("\n").length} lines)
				</button>
			)}
			{isStreaming && (
				<span className="mt-1 inline-block animate-pulse text-muted-foreground/50">
					...
				</span>
			)}
		</div>
	);
};
