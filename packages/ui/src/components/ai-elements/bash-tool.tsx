"use client";

import { CheckIcon, TerminalIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../ui/collapsible";
import { Loader } from "./loader";
import { ShimmerLabel } from "./shimmer-label";

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
	const [isOutputExpanded, setIsOutputExpanded] = useState(false);

	const isPending = state === "input-streaming" || state === "input-available";
	const isSuccess = exitCode === 0;
	const isError = exitCode !== undefined && exitCode !== 0;

	const commandSummary = useMemo(
		() => (command ? extractCommandSummary(command) : ""),
		[command],
	);

	const hasOutput = Boolean(command || stdout || stderr);

	return (
		<Collapsible
			className={cn(
				"overflow-hidden rounded-lg border border-border bg-muted/30",
				className,
			)}
			onOpenChange={(open) => hasOutput && setIsOutputExpanded(open)}
			open={hasOutput ? isOutputExpanded : false}
		>
			<CollapsibleTrigger asChild>
				<button
					className={cn(
						"flex h-7 w-full items-center justify-between px-2.5 text-left",
						hasOutput
							? "cursor-pointer transition-colors duration-150 hover:bg-muted/50"
							: "cursor-default",
					)}
					disabled={!hasOutput}
					type="button"
				>
					<div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
						<TerminalIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
						{isPending ? (
							<ShimmerLabel className="text-xs text-muted-foreground">
								{commandSummary ? "Running command" : "Generating command"}
							</ShimmerLabel>
						) : (
							<span className="text-xs text-muted-foreground">Ran command</span>
						)}
						{commandSummary && (
							<span className="truncate text-foreground">{commandSummary}</span>
						)}
					</div>

					{/* Status */}
					<div className="ml-2 flex shrink-0 items-center gap-2">
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
				</button>
			</CollapsibleTrigger>

			{hasOutput && (
				<CollapsibleContent
					className={cn(
						"border-t border-border data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
					)}
				>
					<div className="px-2.5 py-1.5">
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
				</CollapsibleContent>
			)}
		</Collapsible>
	);
};
