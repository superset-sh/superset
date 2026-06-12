import * as Clipboard from "expo-clipboard";
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	CopyIcon,
	ExternalLinkIcon,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ClickableFilePath } from "./clickable-file-path";
import {
	CodeBlockActions,
	CodeBlockContainer,
	CodeBlockContent,
	CodeBlockHeader,
	CodeBlockTitle,
} from "./code-block";

/** Approximate line count threshold before the expand/collapse controls appear. */
const DEFAULT_MAX_LINES = 15;

export type ShowCodeProps = {
	code: string;
	/** Language for syntax highlighting. Defaults to "text". */
	language?: string;
	/**
	 * When provided, displays a filename header instead of a plain language label.
	 * The filename is made pressable if `onOpen` is also provided.
	 */
	filename?: string;
	/** Line range label shown after the filename, e.g. "1–142". */
	lineRange?: string;
	/** Whether to render line numbers. Default: true. */
	showLineNumbers?: boolean;
	/**
	 * Starting line number for offset display (e.g. when showing a partial file).
	 * Accepted for API parity with web; the mobile CodeBlock always numbers
	 * from 1, so this is currently ignored.
	 */
	startLine?: number;
	/** When false, renders all tokens in the foreground color (no syntax colors). Default: true. */
	colorize?: boolean;
	/**
	 * Number of lines before expand/collapse controls appear.
	 * Default: 15.
	 */
	maxLines?: number;
	/**
	 * When provided, shows an "Open" icon button in the header.
	 * Only rendered when `filename` is also provided. On desktop this opens
	 * the file in the editor; on mobile the caller supplies the behavior.
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
 * When the code exceeds `maxLines`, the block is truncated and a
 * "Show more" link appears below the code.
 */
export function ShowCode({
	code,
	language = "text",
	filename,
	lineRange,
	showLineNumbers = true,
	startLine: _startLine,
	colorize = true,
	maxLines = DEFAULT_MAX_LINES,
	onOpen,
	className,
}: ShowCodeProps) {
	const [isCopied, setIsCopied] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const lines = code.trimEnd().split("\n");
	const isOverflowing = lines.length > maxLines;
	const displayCode =
		isOverflowing && !isExpanded ? lines.slice(0, maxLines).join("\n") : code;

	useEffect(
		() => () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		},
		[],
	);

	const handleCopy = async () => {
		if (isCopied) {
			return;
		}
		try {
			await Clipboard.setStringAsync(code);
			setIsCopied(true);
			timeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
		} catch {
			// ignore — clipboard unavailable
		}
	};

	return (
		<CodeBlockContainer className={className} language={language}>
			<CodeBlockHeader>
				<CodeBlockTitle className="min-w-0 flex-1">
					{filename ? (
						<>
							<ClickableFilePath
								className="text-foreground text-xs"
								onPress={onOpen ? () => onOpen() : undefined}
								path={filename}
							/>
							{lineRange ? (
								<Text className="shrink-0 font-mono">{lineRange}</Text>
							) : null}
						</>
					) : (
						<Text className="font-mono">{language}</Text>
					)}
				</CodeBlockTitle>
				<CodeBlockActions>
					{isOverflowing ? (
						<Button
							accessibilityLabel={isExpanded ? "Collapse" : "Expand"}
							className="h-6 w-6"
							onPress={() => setIsExpanded((prev) => !prev)}
							size="icon"
							variant="ghost"
						>
							<Icon
								as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
								className="size-3.5"
							/>
						</Button>
					) : null}
					{onOpen && filename ? (
						<Button
							accessibilityLabel="Open"
							className="h-6 w-6"
							onPress={() => onOpen()}
							size="icon"
							variant="ghost"
						>
							<Icon as={ExternalLinkIcon} className="size-3.5" />
						</Button>
					) : null}
					<Button
						accessibilityLabel={isCopied ? "Copied" : "Copy"}
						className="h-6 w-6"
						onPress={handleCopy}
						size="icon"
						variant="ghost"
					>
						<Icon as={isCopied ? CheckIcon : CopyIcon} className="size-3.5" />
					</Button>
				</CodeBlockActions>
			</CodeBlockHeader>
			<CodeBlockContent
				code={displayCode}
				language={colorize ? language : "text"}
				showLineNumbers={showLineNumbers}
			/>
			{isOverflowing ? (
				<Pressable
					accessibilityRole="button"
					className={cn("items-center pb-1.5", isExpanded ? "pt-1" : "pt-0")}
					onPress={() => setIsExpanded((prev) => !prev)}
				>
					<Text className="text-muted-foreground text-xs underline">
						{isExpanded ? "Show less" : "Show more"}
					</Text>
				</Pressable>
			) : null}
		</CodeBlockContainer>
	);
}
