"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
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

/** Limit text to N lines, returning whether it was truncated. */
function limitLines(
	text: string,
	maxLines: number,
): { text: string; truncated: boolean } {
	if (!text) return { text: "", truncated: false };
	const lines = text.split("\n");
	if (lines.length <= maxLines) {
		return { text, truncated: false };
	}
	return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}

const MAX_COLLAPSED_LINES = 3;

export const BashTool = ({
	command,
	stdout,
	stderr,
	exitCode,
	state,
	className,
}: BashToolProps) => {
	const [isOutputExpanded, setIsOutputExpanded] = useState(false);

	const isPending = state === "input-streaming" || state === "input-available";
	const isSuccess = exitCode === 0;
	const isError = exitCode !== undefined && exitCode !== 0;
	const _hasOutput = Boolean(stdout || stderr);

	const stdoutLimited = useMemo(
		() => limitLines(stdout ?? "", MAX_COLLAPSED_LINES),
		[stdout],
	);
	const stderrLimited = useMemo(
		() => limitLines(stderr ?? "", MAX_COLLAPSED_LINES),
		[stderr],
	);
	const hasMoreOutput = stdoutLimited.truncated || stderrLimited.truncated;

	const commandSummary = useMemo(
		() => (command ? extractCommandSummary(command) : ""),
		[command],
	);

	// Input still streaming
	if (state === "input-streaming") {
		return (
			<div
				className={cn("flex items-start gap-1.5 rounded-md py-0.5", className)}
			>
				<div className="min-w-0 flex flex-1 items-center gap-1.5">
					<div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
						<span className="shrink-0 whitespace-nowrap font-medium">
							<Shimmer
								as="span"
								duration={1.2}
								className="m-0 inline-flex h-4 items-center text-xs leading-none"
							>
								Generating command
							</Shimmer>
						</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border border-border bg-muted/30",
				className,
			)}
		>
			{/* Header - fixed height to prevent layout shift */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: interactive tool header */}
			<div
				className={cn(
					"flex h-7 items-center justify-between pl-2.5 pr-0.5",
					hasMoreOutput &&
						!isPending &&
						"cursor-pointer transition-colors duration-150 hover:bg-muted/50",
				)}
				onClick={() =>
					hasMoreOutput && !isPending && setIsOutputExpanded(!isOutputExpanded)
				}
			>
				<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
					{isPending ? "Running command: " : "Ran command: "}
					{commandSummary}
				</span>

				{/* Status and expand */}
				<div className="ml-2 flex shrink-0 items-center gap-1.5">
					{!isPending && (
						<div className="flex items-center gap-1 text-xs text-muted-foreground">
							{isSuccess && (
								<>
									<CheckIcon className="h-3 w-3" />
									<span>Success</span>
								</>
							)}
							{isError && (
								<>
									<XIcon className="h-3 w-3" />
									<span>Failed</span>
								</>
							)}
						</div>
					)}
					<div className="flex h-6 w-6 items-center justify-center">
						{isPending && <Loader size={12} />}
					</div>
				</div>
			</div>

			{/* Content - always visible */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: clickable to expand */}
			<div
				className={cn(
					"border-t border-border px-2.5 py-1.5 transition-colors duration-150",
					hasMoreOutput &&
						!isOutputExpanded &&
						"cursor-pointer hover:bg-muted/50",
				)}
				onClick={() =>
					hasMoreOutput && !isOutputExpanded && setIsOutputExpanded(true)
				}
			>
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
						{isOutputExpanded ? stdout : stdoutLimited.text}
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
						{isOutputExpanded ? stderr : stderrLimited.text}
					</div>
				)}
			</div>
		</div>
	);
};
