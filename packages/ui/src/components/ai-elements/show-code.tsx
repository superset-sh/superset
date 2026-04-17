"use client";

import {
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	CopyIcon,
	ExternalLinkIcon,
} from "lucide-react";
import { useState } from "react";
import type { BundledLanguage } from "shiki";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";
import { ClickableFilePath } from "./clickable-file-path";
import { CodeBlock } from "./code-block";

/** Approximate line count threshold before the expand/collapse controls appear (~300px at ~20px/line). */
const DEFAULT_MAX_LINES = 15;

export type ShowCodeProps = {
	code: string;
	/** Shiki language for syntax highlighting. Defaults to "text". */
	language?: BundledLanguage;
	/**
	 * When provided, displays a filename header instead of a plain language label.
	 * The filename is made clickable if `onOpen` is also provided.
	 */
	filename?: string;
	/** Line range label shown after the filename, e.g. "1–142". */
	lineRange?: string;
	/** Whether to render line numbers. Default: true. */
	showLineNumbers?: boolean;
	/**
	 * Starting line number for offset display (e.g. when showing a partial file).
	 * Default: 1.
	 */
	startLine?: number;
	/** When false, renders all tokens in the foreground color (no syntax colors). Default: true. */
	colorize?: boolean;
	/**
	 * Number of lines before expand/collapse controls appear.
	 * Default: 15 (roughly 300px).
	 */
	maxLines?: number;
	/**
	 * When provided, shows an "Open" icon button in the header.
	 * Only rendered when `filename` is also provided.
	 */
	onOpen?: () => void;
	className?: string;
};

/**
 * Shared code display block used for both tool-call file views and
 * markdown code fences. Shows a header (language label or filename + line
 * range), action buttons (expand/collapse, open, copy), and syntax-
 * highlighted code with optional line numbers.
 *
 * When the code exceeds `maxLines`, a gradient overlay with a "Show more"
 * link floats at the bottom, and a chevron button appears in the header.
 */
export function ShowCode({
	code,
	language = "text" as BundledLanguage,
	filename,
	lineRange,
	showLineNumbers = true,
	startLine,
	colorize = true,
	maxLines = DEFAULT_MAX_LINES,
	onOpen,
	className,
}: ShowCodeProps) {
	const [isCopied, setIsCopied] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);

	const lineCount = code.trimEnd().split("\n").length;
	const isOverflowing = lineCount > maxLines;

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		} catch {
			// ignore — clipboard unavailable
		}
	};

	return (
		<div
			className={cn(
				"overflow-hidden rounded-md border border-border",
				className,
			)}
		>
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
				{/* Left: language label or clickable filename + line range */}
				<div className="flex min-w-0 items-center gap-2 font-mono text-xs">
					{filename ? (
						<>
							<ClickableFilePath
								path={filename}
								onOpen={onOpen}
								className="text-foreground"
							/>
							{lineRange && (
								<span className="shrink-0 text-muted-foreground">
									{lineRange}
								</span>
							)}
						</>
					) : (
						<span className="text-muted-foreground">{language}</span>
					)}
				</div>
				{/* Right: action buttons */}
				<div className="ml-2 flex shrink-0 items-center gap-0.5">
					{isOverflowing && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										aria-label={isExpanded ? "Collapse" : "Expand"}
										className="h-6 w-6"
										onClick={() => setIsExpanded((prev) => !prev)}
										size="icon"
										variant="ghost"
									>
										{isExpanded ? (
											<ChevronUpIcon className="h-3.5 w-3.5" />
										) : (
											<ChevronDownIcon className="h-3.5 w-3.5" />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{isExpanded ? "Collapse" : "Expand"}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
					{onOpen && filename && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										aria-label="Open"
										className="h-6 w-6"
										onClick={(e) => {
											e.stopPropagation();
											onOpen();
										}}
										size="icon"
										variant="ghost"
									>
										<ExternalLinkIcon className="h-3.5 w-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Open</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									aria-label={isCopied ? "Copied" : "Copy"}
									className="h-6 w-6"
									onClick={handleCopy}
									size="icon"
									variant="ghost"
								>
									<div className="relative h-3.5 w-3.5">
										<CopyIcon
											className={cn(
												"absolute inset-0 h-3.5 w-3.5 transition-[opacity,transform] duration-200 ease-out",
												isCopied
													? "scale-50 opacity-0"
													: "scale-100 opacity-100",
											)}
										/>
										<CheckIcon
											className={cn(
												"absolute inset-0 h-3.5 w-3.5 transition-[opacity,transform] duration-200 ease-out",
												isCopied
													? "scale-100 opacity-100"
													: "scale-50 opacity-0",
											)}
										/>
									</div>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Copy</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			{/* Code content */}
			<div className="relative">
				<CodeBlock
					className={cn(
						"rounded-none border-0 [&_pre]:!p-2",
						!isExpanded && "[&>div>div]:max-h-[300px]",
					)}
					code={code}
					colorize={colorize}
					language={language}
					showLineNumbers={showLineNumbers}
					startLine={startLine}
				/>

				{/* Floating "Show more" overlay when truncated */}
				{isOverflowing && !isExpanded && (
					<div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-background pb-1.5 pt-8">
						<button
							className="pointer-events-auto text-xs text-muted-foreground underline transition-colors hover:text-foreground"
							onClick={() => setIsExpanded(true)}
							type="button"
						>
							Show more
						</button>
					</div>
				)}

				{/* "Show less" link when fully expanded */}
				{isOverflowing && isExpanded && (
					<div className="flex justify-center pb-1.5 pt-1">
						<button
							className="text-xs text-muted-foreground underline transition-colors hover:text-foreground"
							onClick={() => setIsExpanded(false)}
							type="button"
						>
							Show less
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
