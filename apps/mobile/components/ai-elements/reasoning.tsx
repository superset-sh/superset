import { useControllableState } from "@rn-primitives/hooks";
import { BrainIcon, ChevronDownIcon } from "lucide-react-native";
import type { ReactNode } from "react";
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
import Animated, {
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useDerivedValue,
	withTiming,
} from "react-native-reanimated";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { MessageResponse } from "./message";
import { Shimmer } from "./shimmer";

interface ReasoningContextValue {
	isStreaming: boolean;
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
	duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
	const context = useContext(ReasoningContext);
	if (!context) {
		throw new Error("Reasoning components must be used within Reasoning");
	}
	return context;
};

export type ReasoningProps = React.ComponentProps<typeof Collapsible> & {
	isStreaming?: boolean;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
	({
		className,
		isStreaming = false,
		open,
		defaultOpen,
		onOpenChange,
		duration: durationProp,
		children,
		...props
	}: ReasoningProps) => {
		const resolvedDefaultOpen = defaultOpen ?? isStreaming;
		// Track if defaultOpen was explicitly set to false (to prevent auto-open)
		const isExplicitlyClosed = defaultOpen === false;

		const [isOpenState, setIsOpen] = useControllableState<boolean>({
			defaultProp: resolvedDefaultOpen,
			onChange: onOpenChange,
			prop: open,
		});
		const isOpen = isOpenState ?? false;
		const [duration, setDuration] = useControllableState<number | undefined>({
			defaultProp: undefined,
			prop: durationProp,
		});

		const hasEverStreamedRef = useRef(isStreaming);
		const [hasAutoClosed, setHasAutoClosed] = useState(false);
		const startTimeRef = useRef<number | null>(null);

		// Track when streaming starts and compute duration
		useEffect(() => {
			if (isStreaming) {
				hasEverStreamedRef.current = true;
				if (startTimeRef.current === null) {
					startTimeRef.current = Date.now();
				}
			} else if (startTimeRef.current !== null) {
				setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
				startTimeRef.current = null;
			}
		}, [isStreaming, setDuration]);

		// Auto-open when streaming starts (unless explicitly closed)
		useEffect(() => {
			if (isStreaming && !isOpen && !isExplicitlyClosed) {
				setIsOpen(true);
			}
		}, [isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

		// Auto-close when streaming ends (once only, and only if it ever streamed)
		useEffect(() => {
			if (
				hasEverStreamedRef.current &&
				!isStreaming &&
				isOpen &&
				!hasAutoClosed
			) {
				const timer = setTimeout(() => {
					setIsOpen(false);
					setHasAutoClosed(true);
				}, AUTO_CLOSE_DELAY);

				return () => clearTimeout(timer);
			}
		}, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);

		const handleOpenChange = useCallback(
			(newOpen: boolean) => {
				setIsOpen(newOpen);
			},
			[setIsOpen],
		);

		const contextValue = useMemo(
			() => ({ duration, isOpen, isStreaming, setIsOpen }),
			[duration, isOpen, isStreaming, setIsOpen],
		);

		return (
			<ReasoningContext.Provider value={contextValue}>
				<Collapsible
					className={cn("mb-4", className)}
					onOpenChange={handleOpenChange}
					open={isOpen}
					{...props}
				>
					{children}
				</Collapsible>
			</ReasoningContext.Provider>
		);
	},
);

export type ReasoningTriggerProps = React.ComponentProps<
	typeof CollapsibleTrigger
> & {
	getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
	if (isStreaming || duration === 0) {
		return <Shimmer duration={1}>Thinking...</Shimmer>;
	}
	if (duration === undefined) {
		return <Text>Thought for a few seconds</Text>;
	}
	return <Text>Thought for {duration} seconds</Text>;
};

export const ReasoningTrigger = memo(
	({
		className,
		children,
		getThinkingMessage = defaultGetThinkingMessage,
		...props
	}: ReasoningTriggerProps) => {
		const { isStreaming, isOpen, duration } = useReasoning();

		const progress = useDerivedValue(
			() =>
				isOpen
					? withTiming(1, { duration: 200 })
					: withTiming(0, { duration: 200 }),
			[isOpen],
		);
		const chevronStyle = useAnimatedStyle(
			() => ({
				transform: [{ rotate: `${progress.value * 180}deg` }],
			}),
			[progress],
		);

		return (
			<TextClassContext.Provider value="text-muted-foreground text-sm">
				<CollapsibleTrigger
					className={cn("w-full flex-row items-center gap-2", className)}
					{...props}
				>
					{children ?? (
						<>
							<Icon as={BrainIcon} className="size-4 text-muted-foreground" />
							{getThinkingMessage(isStreaming, duration)}
							<Animated.View style={chevronStyle}>
								<Icon
									as={ChevronDownIcon}
									className="size-4 text-muted-foreground"
								/>
							</Animated.View>
						</>
					)}
				</CollapsibleTrigger>
			</TextClassContext.Provider>
		);
	},
);

export type ReasoningContentProps = Omit<
	React.ComponentProps<typeof CollapsibleContent>,
	"children"
> & {
	children: string;
};

export const ReasoningContent = memo(
	({ className, children, ...props }: ReasoningContentProps) => (
		<CollapsibleContent className={cn("mt-4", className)} {...props}>
			<Animated.View
				entering={FadeIn.duration(200)}
				exiting={FadeOut.duration(150)}
			>
				<MessageResponse>{children}</MessageResponse>
			</Animated.View>
		</CollapsibleContent>
	),
);

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
