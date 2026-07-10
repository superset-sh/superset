import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react-native";
import type { ReactElement } from "react";
import {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { Platform, View } from "react-native";
import type { MarkdownStyle } from "react-native-enriched-markdown";
import { StreamdownText } from "react-native-streamdown";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type MessageRole = "system" | "user" | "assistant";

interface MessageContextType {
	from: MessageRole;
}

const MessageContext = createContext<MessageContextType>({
	from: "assistant",
});

export const useMessage = () => useContext(MessageContext);

export type MessageProps = React.ComponentProps<typeof View> & {
	from: MessageRole;
};

export const Message = ({ className, from, ...props }: MessageProps) => {
	const contextValue = useMemo(() => ({ from }), [from]);

	return (
		<MessageContext.Provider value={contextValue}>
			<View
				className={cn(
					"w-full max-w-[95%] flex-col gap-2",
					from === "user" && "ml-auto justify-end",
					className,
				)}
				{...props}
			/>
		</MessageContext.Provider>
	);
};

export type MessageContentProps = React.ComponentProps<typeof View>;

export const MessageContent = ({
	children,
	className,
	...props
}: MessageContentProps) => {
	const { from } = useMessage();

	return (
		<TextClassContext.Provider value="text-sm text-foreground">
			<View
				className={cn(
					"min-w-0 max-w-full flex-col gap-2 overflow-hidden",
					from === "user"
						? "self-end rounded-lg bg-secondary px-4 py-3"
						: "self-start",
					className,
				)}
				{...props}
			>
				{children}
			</View>
		</TextClassContext.Provider>
	);
};

export type MessageActionsProps = React.ComponentProps<typeof View>;

export const MessageActions = ({
	className,
	children,
	...props
}: MessageActionsProps) => (
	<View className={cn("flex-row items-center gap-1", className)} {...props}>
		{children}
	</View>
);

export type MessageActionProps = ButtonProps & {
	tooltip?: string;
	label?: string;
};

export const MessageAction = ({
	tooltip,
	children,
	label,
	variant = "ghost",
	size = "icon",
	...props
}: MessageActionProps) => {
	const button = (
		<Button
			accessibilityLabel={label || tooltip}
			size={size}
			variant={variant}
			{...props}
		>
			{children}
		</Button>
	);

	if (tooltip) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				<TooltipContent>
					<Text>{tooltip}</Text>
				</TooltipContent>
			</Tooltip>
		);
	}

	return button;
};

interface MessageBranchContextType {
	currentBranch: number;
	totalBranches: number;
	goToPrevious: () => void;
	goToNext: () => void;
	branches: ReactElement[];
	setBranches: (branches: ReactElement[]) => void;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
	null,
);

const useMessageBranch = () => {
	const context = useContext(MessageBranchContext);

	if (!context) {
		throw new Error(
			"MessageBranch components must be used within MessageBranch",
		);
	}

	return context;
};

export type MessageBranchProps = React.ComponentProps<typeof View> & {
	defaultBranch?: number;
	onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
	defaultBranch = 0,
	onBranchChange,
	className,
	...props
}: MessageBranchProps) => {
	const [currentBranch, setCurrentBranch] = useState(defaultBranch);
	const [branches, setBranches] = useState<ReactElement[]>([]);

	const handleBranchChange = useCallback(
		(newBranch: number) => {
			setCurrentBranch(newBranch);
			onBranchChange?.(newBranch);
		},
		[onBranchChange],
	);

	const goToPrevious = useCallback(() => {
		const newBranch =
			currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
		handleBranchChange(newBranch);
	}, [currentBranch, branches.length, handleBranchChange]);

	const goToNext = useCallback(() => {
		const newBranch =
			currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
		handleBranchChange(newBranch);
	}, [currentBranch, branches.length, handleBranchChange]);

	const contextValue = useMemo<MessageBranchContextType>(
		() => ({
			branches,
			currentBranch,
			goToNext,
			goToPrevious,
			setBranches,
			totalBranches: branches.length,
		}),
		[branches, currentBranch, goToNext, goToPrevious],
	);

	return (
		<MessageBranchContext.Provider value={contextValue}>
			<View className={cn("w-full gap-2", className)} {...props} />
		</MessageBranchContext.Provider>
	);
};

export type MessageBranchContentProps = Omit<
	React.ComponentProps<typeof View>,
	"children"
> & {
	children: ReactElement | ReactElement[];
};

export const MessageBranchContent = ({
	children,
	className,
	...props
}: MessageBranchContentProps) => {
	const { currentBranch, setBranches, branches } = useMessageBranch();
	const childrenArray = useMemo(
		() => (Array.isArray(children) ? children : [children]),
		[children],
	);

	useEffect(() => {
		if (branches.length !== childrenArray.length) {
			setBranches(childrenArray);
		}
	}, [childrenArray, branches, setBranches]);

	return childrenArray.map((branch, index) => (
		<View
			className={cn(
				"gap-2 overflow-hidden",
				index === currentBranch ? "flex" : "hidden",
				className,
			)}
			key={branch.key}
			{...props}
		>
			{branch}
		</View>
	));
};

export type MessageBranchSelectorProps = React.ComponentProps<typeof View>;

export const MessageBranchSelector = ({
	className,
	...props
}: MessageBranchSelectorProps) => {
	const { totalBranches } = useMessageBranch();

	if (totalBranches <= 1) {
		return null;
	}

	return <View className={cn("flex-row items-center", className)} {...props} />;
};

export type MessageBranchPreviousProps = ButtonProps;

export const MessageBranchPrevious = ({
	children,
	...props
}: MessageBranchPreviousProps) => {
	const { goToPrevious, totalBranches } = useMessageBranch();

	return (
		<Button
			accessibilityLabel="Previous branch"
			disabled={totalBranches <= 1}
			onPress={goToPrevious}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ?? <Icon as={ChevronLeftIcon} className="size-4" />}
		</Button>
	);
};

export type MessageBranchNextProps = ButtonProps;

export const MessageBranchNext = ({
	children,
	...props
}: MessageBranchNextProps) => {
	const { goToNext, totalBranches } = useMessageBranch();

	return (
		<Button
			accessibilityLabel="Next branch"
			disabled={totalBranches <= 1}
			onPress={goToNext}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ?? <Icon as={ChevronRightIcon} className="size-4" />}
		</Button>
	);
};

export type MessageBranchPageProps = React.ComponentProps<typeof Text>;

export const MessageBranchPage = ({
	className,
	...props
}: MessageBranchPageProps) => {
	const { currentBranch, totalBranches } = useMessageBranch();

	return (
		<Text
			className={cn("px-2 text-muted-foreground text-sm", className)}
			{...props}
		>
			{currentBranch + 1} of {totalBranches}
		</Text>
	);
};

const FONT_MONO = Platform.select({ ios: "Menlo", default: "monospace" });

export const MESSAGE_MARKDOWN_STYLE: MarkdownStyle = {
	paragraph: {
		color: THEME.dark.foreground,
		fontSize: 14,
		lineHeight: 21,
		marginTop: 4,
		marginBottom: 4,
	},
	h1: {
		color: THEME.dark.foreground,
		fontSize: 24,
		fontWeight: "700",
		marginTop: 16,
		marginBottom: 8,
	},
	h2: {
		color: THEME.dark.foreground,
		fontSize: 20,
		fontWeight: "600",
		marginTop: 14,
		marginBottom: 6,
	},
	h3: {
		color: THEME.dark.foreground,
		fontSize: 18,
		fontWeight: "600",
		marginTop: 12,
		marginBottom: 6,
	},
	h4: {
		color: THEME.dark.foreground,
		fontSize: 16,
		fontWeight: "600",
		marginTop: 10,
		marginBottom: 4,
	},
	h5: {
		color: THEME.dark.foreground,
		fontSize: 14,
		fontWeight: "600",
		marginTop: 8,
		marginBottom: 4,
	},
	h6: {
		color: THEME.dark.mutedForeground,
		fontSize: 14,
		fontWeight: "600",
		marginTop: 8,
		marginBottom: 4,
	},
	blockquote: {
		color: THEME.dark.mutedForeground,
		fontSize: 14,
		lineHeight: 21,
		borderColor: THEME.dark.border,
		borderWidth: 3,
		gapWidth: 10,
		backgroundColor: THEME.dark.secondary,
	},
	list: {
		color: THEME.dark.foreground,
		fontSize: 14,
		lineHeight: 21,
		bulletColor: THEME.dark.mutedForeground,
		markerColor: THEME.dark.mutedForeground,
	},
	codeBlock: {
		color: THEME.dark.foreground,
		fontFamily: FONT_MONO,
		fontSize: 12,
		backgroundColor: THEME.dark.secondary,
		borderColor: THEME.dark.border,
		borderWidth: 1,
		borderRadius: 8,
		padding: 12,
	},
	code: {
		color: THEME.dark.foreground,
		fontFamily: FONT_MONO,
		fontSize: 13,
		backgroundColor: THEME.dark.secondary,
		borderColor: THEME.dark.border,
	},
	link: {
		color: THEME.dark.primary,
		underline: true,
	},
	strong: {
		color: THEME.dark.foreground,
	},
	table: {
		color: THEME.dark.foreground,
		fontSize: 13,
		headerBackgroundColor: THEME.dark.secondary,
		headerTextColor: THEME.dark.foreground,
		rowEvenBackgroundColor: THEME.dark.background,
		rowOddBackgroundColor: THEME.dark.background,
		borderColor: THEME.dark.border,
		borderWidth: 1,
		borderRadius: 6,
	},
	thematicBreak: {
		color: THEME.dark.border,
		height: 1,
	},
	taskList: {
		checkedColor: THEME.dark.primary,
		borderColor: THEME.dark.mutedForeground,
		checkmarkColor: THEME.dark.primaryForeground,
		checkedTextColor: THEME.dark.mutedForeground,
	},
	math: {
		color: THEME.dark.foreground,
		backgroundColor: THEME.dark.secondary,
	},
	inlineMath: {
		color: THEME.dark.foreground,
	},
};

export type MessageResponseProps = Omit<
	React.ComponentProps<typeof StreamdownText>,
	"markdown"
> & {
	children: string;
};

export const MessageResponse = memo(
	({
		children,
		markdownStyle,
		flavor = "github",
		...props
	}: MessageResponseProps) => (
		<StreamdownText
			flavor={flavor}
			markdown={children}
			markdownStyle={markdownStyle ?? MESSAGE_MARKDOWN_STYLE}
			{...props}
		/>
	),
	(prevProps, nextProps) => prevProps.children === nextProps.children,
);

MessageResponse.displayName = "MessageResponse";

export type MessageToolbarProps = React.ComponentProps<typeof View>;

export const MessageToolbar = ({
	className,
	children,
	...props
}: MessageToolbarProps) => (
	<View
		className={cn(
			"mt-4 w-full flex-row items-center justify-between gap-4",
			className,
		)}
		{...props}
	>
		{children}
	</View>
);
