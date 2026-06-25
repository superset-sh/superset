import { useControllableState } from "@rn-primitives/hooks";
import * as Clipboard from "expo-clipboard";
import {
	AlertTriangleIcon,
	CheckIcon,
	ChevronDownIcon,
	CopyIcon,
} from "lucide-react-native";
import {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Pressable, View } from "react-native";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

// Regex patterns for parsing stack traces
const STACK_FRAME_WITH_PARENS_REGEX = /^at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/;
const STACK_FRAME_WITHOUT_FN_REGEX = /^at\s+(.+):(\d+):(\d+)$/;
const ERROR_TYPE_REGEX = /^(\w+Error|Error):\s*(.*)$/;
const AT_PREFIX_REGEX = /^at\s+/;

interface StackFrame {
	raw: string;
	functionName: string | null;
	filePath: string | null;
	lineNumber: number | null;
	columnNumber: number | null;
	isInternal: boolean;
}

interface ParsedStackTrace {
	errorType: string | null;
	errorMessage: string;
	frames: StackFrame[];
	raw: string;
}

interface StackTraceContextValue {
	trace: ParsedStackTrace;
	raw: string;
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
	onFilePathClick?: (filePath: string, line?: number, column?: number) => void;
}

const StackTraceContext = createContext<StackTraceContextValue | null>(null);

const useStackTrace = () => {
	const context = useContext(StackTraceContext);
	if (!context) {
		throw new Error("StackTrace components must be used within StackTrace");
	}
	return context;
};

const parseStackFrame = (line: string): StackFrame => {
	const trimmed = line.trim();

	// Pattern: at functionName (filePath:line:column)
	const withParensMatch = trimmed.match(STACK_FRAME_WITH_PARENS_REGEX);
	if (withParensMatch) {
		const [, functionName, filePath, lineNum, colNum] = withParensMatch;
		const isInternal =
			filePath.includes("node_modules") ||
			filePath.startsWith("node:") ||
			filePath.includes("internal/");
		return {
			columnNumber: colNum ? Number.parseInt(colNum, 10) : null,
			filePath: filePath ?? null,
			functionName: functionName ?? null,
			isInternal,
			lineNumber: lineNum ? Number.parseInt(lineNum, 10) : null,
			raw: trimmed,
		};
	}

	// Pattern: at filePath:line:column (no function name)
	const withoutFnMatch = trimmed.match(STACK_FRAME_WITHOUT_FN_REGEX);
	if (withoutFnMatch) {
		const [, filePath, lineNum, colNum] = withoutFnMatch;
		const isInternal =
			(filePath?.includes("node_modules") ?? false) ||
			(filePath?.startsWith("node:") ?? false) ||
			(filePath?.includes("internal/") ?? false);
		return {
			columnNumber: colNum ? Number.parseInt(colNum, 10) : null,
			filePath: filePath ?? null,
			functionName: null,
			isInternal,
			lineNumber: lineNum ? Number.parseInt(lineNum, 10) : null,
			raw: trimmed,
		};
	}

	// Fallback: unparseable line
	return {
		columnNumber: null,
		filePath: null,
		functionName: null,
		isInternal: trimmed.includes("node_modules") || trimmed.includes("node:"),
		lineNumber: null,
		raw: trimmed,
	};
};

const parseStackTrace = (trace: string): ParsedStackTrace => {
	const lines = trace.split("\n").filter((line) => line.trim());

	if (lines.length === 0) {
		return {
			errorMessage: trace,
			errorType: null,
			frames: [],
			raw: trace,
		};
	}

	const firstLine = lines[0].trim();
	let errorType: string | null = null;
	let errorMessage = firstLine;

	// Try to extract error type from "ErrorType: message" format
	const errorMatch = firstLine.match(ERROR_TYPE_REGEX);
	if (errorMatch) {
		const [, type, msg] = errorMatch;
		errorType = type;
		errorMessage = msg || "";
	}

	// Parse stack frames (lines starting with "at")
	const frames = lines
		.slice(1)
		.filter((line) => line.trim().startsWith("at "))
		.map(parseStackFrame);

	return {
		errorMessage,
		errorType,
		frames,
		raw: trace,
	};
};

export type StackTraceProps = React.ComponentProps<typeof View> & {
	trace: string;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	onFilePathClick?: (filePath: string, line?: number, column?: number) => void;
};

export const StackTrace = memo(
	({
		trace,
		className,
		open,
		defaultOpen = false,
		onOpenChange,
		onFilePathClick,
		children,
		...props
	}: StackTraceProps) => {
		const [isOpenState, setIsOpen] = useControllableState<boolean>({
			defaultProp: defaultOpen,
			onChange: onOpenChange,
			prop: open,
		});
		const isOpen = isOpenState ?? false;

		const parsedTrace = useMemo(() => parseStackTrace(trace), [trace]);

		const contextValue = useMemo(
			() => ({
				isOpen,
				onFilePathClick,
				raw: trace,
				setIsOpen,
				trace: parsedTrace,
			}),
			[parsedTrace, trace, isOpen, setIsOpen, onFilePathClick],
		);

		return (
			<StackTraceContext.Provider value={contextValue}>
				<TextClassContext.Provider value="font-mono text-sm">
					<View
						className={cn(
							"w-full overflow-hidden rounded-lg border border-border bg-background",
							className,
						)}
						{...props}
					>
						{children}
					</View>
				</TextClassContext.Provider>
			</StackTraceContext.Provider>
		);
	},
);

export type StackTraceHeaderProps = React.ComponentProps<
	typeof CollapsibleTrigger
>;

export const StackTraceHeader = memo(
	({ className, children, ...props }: StackTraceHeaderProps) => {
		const { isOpen, setIsOpen } = useStackTrace();

		return (
			<Collapsible onOpenChange={setIsOpen} open={isOpen}>
				<CollapsibleTrigger
					className={cn("w-full flex-row items-center gap-3 p-3", className)}
					{...props}
				>
					{children}
				</CollapsibleTrigger>
			</Collapsible>
		);
	},
);

export type StackTraceErrorProps = React.ComponentProps<typeof View>;

export const StackTraceError = memo(
	({ className, children, ...props }: StackTraceErrorProps) => (
		<View
			className={cn(
				"flex-1 flex-row items-center gap-2 overflow-hidden",
				className,
			)}
			{...props}
		>
			<Icon
				as={AlertTriangleIcon}
				className="size-4 shrink-0 text-destructive"
			/>
			{children}
		</View>
	),
);

export type StackTraceErrorTypeProps = React.ComponentProps<typeof Text>;

export const StackTraceErrorType = memo(
	({ className, children, ...props }: StackTraceErrorTypeProps) => {
		const { trace } = useStackTrace();

		return (
			<Text
				className={cn("shrink-0 font-semibold text-destructive", className)}
				{...props}
			>
				{children ?? trace.errorType}
			</Text>
		);
	},
);

export type StackTraceErrorMessageProps = React.ComponentProps<typeof Text>;

export const StackTraceErrorMessage = memo(
	({ className, children, ...props }: StackTraceErrorMessageProps) => {
		const { trace } = useStackTrace();

		return (
			<Text
				className={cn("shrink text-foreground", className)}
				numberOfLines={1}
				{...props}
			>
				{children ?? trace.errorMessage}
			</Text>
		);
	},
);

export type StackTraceActionsProps = React.ComponentProps<typeof View>;

export const StackTraceActions = memo(
	({ className, children, ...props }: StackTraceActionsProps) => (
		<View
			className={cn("shrink-0 flex-row items-center gap-1", className)}
			{...props}
		>
			{children}
		</View>
	),
);

export type StackTraceCopyButtonProps = ButtonProps & {
	onCopy?: () => void;
	onError?: (error: Error) => void;
	timeout?: number;
};

export const StackTraceCopyButton = memo(
	({
		onCopy,
		onError,
		timeout = 2000,
		className,
		children,
		...props
	}: StackTraceCopyButtonProps) => {
		const [isCopied, setIsCopied] = useState(false);
		const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		const { raw } = useStackTrace();

		const copyToClipboard = useCallback(async () => {
			try {
				await Clipboard.setStringAsync(raw);
				setIsCopied(true);
				onCopy?.();
				timeoutRef.current = setTimeout(() => setIsCopied(false), timeout);
			} catch (error) {
				onError?.(error as Error);
			}
		}, [raw, onCopy, onError, timeout]);

		useEffect(
			() => () => {
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}
			},
			[],
		);

		return (
			<Button
				className={cn("size-7", className)}
				onPress={copyToClipboard}
				size="icon"
				variant="ghost"
				{...props}
			>
				{children ?? (
					<Icon as={isCopied ? CheckIcon : CopyIcon} className="size-3.5" />
				)}
			</Button>
		);
	},
);

export type StackTraceExpandButtonProps = React.ComponentProps<typeof View>;

export const StackTraceExpandButton = memo(
	({ className, ...props }: StackTraceExpandButtonProps) => {
		const { isOpen } = useStackTrace();

		return (
			<View
				className={cn("size-7 items-center justify-center", className)}
				{...props}
			>
				<View
					style={isOpen ? { transform: [{ rotate: "180deg" }] } : undefined}
				>
					<Icon as={ChevronDownIcon} className="size-4 text-muted-foreground" />
				</View>
			</View>
		);
	},
);

export type StackTraceContentProps = React.ComponentProps<
	typeof CollapsibleContent
>;

export const StackTraceContent = memo(
	({ className, children, ...props }: StackTraceContentProps) => {
		const { isOpen } = useStackTrace();

		return (
			<Collapsible open={isOpen}>
				<CollapsibleContent
					className={cn("border-border border-t bg-muted/30", className)}
					{...props}
				>
					{children}
				</CollapsibleContent>
			</Collapsible>
		);
	},
);

export type StackTraceFramesProps = React.ComponentProps<typeof View> & {
	showInternalFrames?: boolean;
	maxVisibleFrames?: number;
};

interface FilePathButtonProps {
	frame: StackFrame;
	onFilePathClick?: (
		filePath: string,
		lineNumber?: number,
		columnNumber?: number,
	) => void;
}

const FilePathButton = memo(
	({ frame, onFilePathClick }: FilePathButtonProps) => {
		const handlePress = useCallback(() => {
			if (frame.filePath) {
				onFilePathClick?.(
					frame.filePath,
					frame.lineNumber ?? undefined,
					frame.columnNumber ?? undefined,
				);
			}
		}, [frame, onFilePathClick]);

		return (
			<Text
				className="text-xs underline"
				onPress={onFilePathClick ? handlePress : undefined}
				suppressHighlighting
			>
				{frame.filePath}
				{frame.lineNumber !== null && `:${frame.lineNumber}`}
				{frame.columnNumber !== null && `:${frame.columnNumber}`}
			</Text>
		);
	},
);

FilePathButton.displayName = "FilePathButton";

export const StackTraceFrames = memo(
	({
		className,
		showInternalFrames = true,
		maxVisibleFrames = 10,
		...props
	}: StackTraceFramesProps) => {
		const { trace, onFilePathClick } = useStackTrace();
		const [showAll, setShowAll] = useState(false);

		const framesToShow = showInternalFrames
			? trace.frames
			: trace.frames.filter((f) => !f.isInternal);
		const visibleFrames = showAll
			? framesToShow
			: framesToShow.slice(0, maxVisibleFrames);
		const hiddenCount = framesToShow.length - visibleFrames.length;

		return (
			<View className={cn("gap-1 p-3", className)} {...props}>
				{visibleFrames.map((frame) => (
					<Text
						className={cn(
							"text-xs",
							frame.isInternal
								? "text-muted-foreground/50"
								: "text-foreground/90",
						)}
						key={frame.raw}
					>
						<Text className="text-muted-foreground text-xs">at </Text>
						{frame.functionName && (
							<Text
								className={cn(
									"text-xs",
									!frame.isInternal && "text-foreground",
								)}
							>
								{frame.functionName}{" "}
							</Text>
						)}
						{frame.filePath && (
							<>
								<Text className="text-muted-foreground text-xs">(</Text>
								<FilePathButton
									frame={frame}
									onFilePathClick={onFilePathClick}
								/>
								<Text className="text-muted-foreground text-xs">)</Text>
							</>
						)}
						{!(frame.filePath || frame.functionName) && (
							<Text className="text-xs">
								{frame.raw.replace(AT_PREFIX_REGEX, "")}
							</Text>
						)}
					</Text>
				))}
				{hiddenCount > 0 && (
					<Pressable onPress={() => setShowAll(true)}>
						<Text className="text-muted-foreground text-xs underline">
							Show {hiddenCount} more frames
						</Text>
					</Pressable>
				)}
				{framesToShow.length === 0 && (
					<Text className="text-muted-foreground text-xs">No stack frames</Text>
				)}
			</View>
		);
	},
);

StackTrace.displayName = "StackTrace";
StackTraceHeader.displayName = "StackTraceHeader";
StackTraceError.displayName = "StackTraceError";
StackTraceErrorType.displayName = "StackTraceErrorType";
StackTraceErrorMessage.displayName = "StackTraceErrorMessage";
StackTraceActions.displayName = "StackTraceActions";
StackTraceCopyButton.displayName = "StackTraceCopyButton";
StackTraceExpandButton.displayName = "StackTraceExpandButton";
StackTraceContent.displayName = "StackTraceContent";
StackTraceFrames.displayName = "StackTraceFrames";
