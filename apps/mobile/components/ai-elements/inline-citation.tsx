import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react-native";
import type { RefObject } from "react";
import {
	Children,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const getSourceHostname = (source: string) => {
	try {
		return new URL(source).hostname;
	} catch {
		return source;
	}
};

export type InlineCitationProps = React.ComponentProps<typeof View>;

export const InlineCitation = ({
	className,
	...props
}: InlineCitationProps) => (
	<View
		className={cn("flex-row flex-wrap items-center gap-1", className)}
		{...props}
	/>
);

export type InlineCitationTextProps = React.ComponentProps<typeof Text>;

export const InlineCitationText = ({
	className,
	...props
}: InlineCitationTextProps) => <Text className={className} {...props} />;

export type InlineCitationCardProps = React.ComponentProps<typeof Popover>;

export const InlineCitationCard = (props: InlineCitationCardProps) => (
	<Popover {...props} />
);

export type InlineCitationCardTriggerProps = React.ComponentProps<
	typeof PopoverTrigger
> & {
	sources: string[];
};

export const InlineCitationCardTrigger = ({
	sources,
	className,
	...props
}: InlineCitationCardTriggerProps) => (
	<PopoverTrigger className={cn("ml-1", className)} {...props}>
		<Badge className="rounded-full" variant="secondary">
			<Text>
				{sources[0]
					? `${getSourceHostname(sources[0])}${
							sources.length > 1 ? ` +${sources.length - 1}` : ""
						}`
					: "unknown"}
			</Text>
		</Badge>
	</PopoverTrigger>
);

export type InlineCitationCardBodyProps = React.ComponentProps<
	typeof PopoverContent
>;

export const InlineCitationCardBody = ({
	className,
	...props
}: InlineCitationCardBodyProps) => (
	<PopoverContent className={cn("w-80 p-0", className)} {...props} />
);

interface InlineCitationCarouselContextType {
	currentIndex: number;
	itemCount: number;
	itemWidth: number;
	scrollViewRef: RefObject<ScrollView | null>;
	setCurrentIndex: (index: number) => void;
	setItemCount: (count: number) => void;
	scrollToIndex: (index: number) => void;
}

const InlineCitationCarouselContext =
	createContext<InlineCitationCarouselContextType | null>(null);

const useInlineCitationCarousel = () => {
	const context = useContext(InlineCitationCarouselContext);

	if (!context) {
		throw new Error(
			"InlineCitationCarousel components must be used within InlineCitationCarousel",
		);
	}

	return context;
};

export type InlineCitationCarouselProps = React.ComponentProps<typeof View>;

export const InlineCitationCarousel = ({
	className,
	children,
	...props
}: InlineCitationCarouselProps) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [itemCount, setItemCount] = useState(0);
	const [itemWidth, setItemWidth] = useState(0);
	const scrollViewRef = useRef<ScrollView | null>(null);

	const scrollToIndex = useCallback(
		(index: number) => {
			const clampedIndex = Math.min(Math.max(index, 0), itemCount - 1);
			scrollViewRef.current?.scrollTo({
				animated: true,
				x: clampedIndex * itemWidth,
			});
			setCurrentIndex(clampedIndex);
		},
		[itemCount, itemWidth],
	);

	const contextValue = useMemo<InlineCitationCarouselContextType>(
		() => ({
			currentIndex,
			itemCount,
			itemWidth,
			scrollToIndex,
			scrollViewRef,
			setCurrentIndex,
			setItemCount,
		}),
		[currentIndex, itemCount, itemWidth, scrollToIndex],
	);

	return (
		<InlineCitationCarouselContext.Provider value={contextValue}>
			<View
				className={cn("w-full", className)}
				onLayout={(event) => setItemWidth(event.nativeEvent.layout.width)}
				{...props}
			>
				{children}
			</View>
		</InlineCitationCarouselContext.Provider>
	);
};

export type InlineCitationCarouselContentProps = React.ComponentProps<
	typeof ScrollView
>;

export const InlineCitationCarouselContent = ({
	children,
	...props
}: InlineCitationCarouselContentProps) => {
	const { itemWidth, scrollViewRef, setCurrentIndex, setItemCount } =
		useInlineCitationCarousel();

	const childCount = Children.count(children);

	useEffect(() => {
		setItemCount(childCount);
	}, [childCount, setItemCount]);

	const handleMomentumScrollEnd = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			if (itemWidth <= 0) {
				return;
			}
			setCurrentIndex(
				Math.round(event.nativeEvent.contentOffset.x / itemWidth),
			);
		},
		[itemWidth, setCurrentIndex],
	);

	return (
		<ScrollView
			horizontal
			onMomentumScrollEnd={handleMomentumScrollEnd}
			pagingEnabled
			ref={scrollViewRef}
			showsHorizontalScrollIndicator={false}
			{...props}
		>
			{children}
		</ScrollView>
	);
};

export type InlineCitationCarouselItemProps = React.ComponentProps<typeof View>;

export const InlineCitationCarouselItem = ({
	className,
	style,
	...props
}: InlineCitationCarouselItemProps) => {
	const { itemWidth } = useInlineCitationCarousel();

	return (
		<View
			className={cn("gap-2 p-4", className)}
			style={[itemWidth > 0 ? { width: itemWidth } : undefined, style]}
			{...props}
		/>
	);
};

export type InlineCitationCarouselHeaderProps = React.ComponentProps<
	typeof View
>;

export const InlineCitationCarouselHeader = ({
	className,
	...props
}: InlineCitationCarouselHeaderProps) => (
	<View
		className={cn(
			"flex-row items-center justify-between gap-2 rounded-t-md bg-secondary p-2",
			className,
		)}
		{...props}
	/>
);

export type InlineCitationCarouselIndexProps = React.ComponentProps<
	typeof View
>;

export const InlineCitationCarouselIndex = ({
	children,
	className,
	...props
}: InlineCitationCarouselIndexProps) => {
	const { currentIndex, itemCount } = useInlineCitationCarousel();

	const dots = useMemo(
		() =>
			Array.from({ length: itemCount }, (_, index) => ({
				active: index === currentIndex,
				key: `dot-${index}`,
			})),
		[currentIndex, itemCount],
	);

	return (
		<View
			className={cn(
				"flex-1 flex-row items-center justify-end gap-1.5 px-3 py-1",
				className,
			)}
			{...props}
		>
			{children ??
				dots.map((dot) => (
					<View
						className={cn(
							"size-1.5 rounded-full",
							dot.active ? "bg-foreground" : "bg-muted-foreground/40",
						)}
						key={dot.key}
					/>
				))}
		</View>
	);
};

export type InlineCitationCarouselPrevProps = React.ComponentProps<
	typeof Pressable
>;

export const InlineCitationCarouselPrev = ({
	className,
	...props
}: InlineCitationCarouselPrevProps) => {
	const { currentIndex, scrollToIndex } = useInlineCitationCarousel();

	const handlePress = useCallback(() => {
		scrollToIndex(currentIndex - 1);
	}, [currentIndex, scrollToIndex]);

	return (
		<Pressable
			accessibilityLabel="Previous"
			className={cn("shrink-0", className)}
			onPress={handlePress}
			{...props}
		>
			<Icon as={ArrowLeftIcon} className="size-4 text-muted-foreground" />
		</Pressable>
	);
};

export type InlineCitationCarouselNextProps = React.ComponentProps<
	typeof Pressable
>;

export const InlineCitationCarouselNext = ({
	className,
	...props
}: InlineCitationCarouselNextProps) => {
	const { currentIndex, scrollToIndex } = useInlineCitationCarousel();

	const handlePress = useCallback(() => {
		scrollToIndex(currentIndex + 1);
	}, [currentIndex, scrollToIndex]);

	return (
		<Pressable
			accessibilityLabel="Next"
			className={cn("shrink-0", className)}
			onPress={handlePress}
			{...props}
		>
			<Icon as={ArrowRightIcon} className="size-4 text-muted-foreground" />
		</Pressable>
	);
};

export type InlineCitationSourceProps = React.ComponentProps<typeof View> & {
	title?: string;
	url?: string;
	description?: string;
};

export const InlineCitationSource = ({
	title,
	url,
	description,
	className,
	children,
	...props
}: InlineCitationSourceProps) => (
	<View className={cn("gap-1", className)} {...props}>
		{title && (
			<Text className="font-medium text-sm leading-tight" numberOfLines={1}>
				{title}
			</Text>
		)}
		{url && (
			<Text className="text-muted-foreground text-xs" numberOfLines={1}>
				{url}
			</Text>
		)}
		{description && (
			<Text
				className="text-muted-foreground text-sm leading-relaxed"
				numberOfLines={3}
			>
				{description}
			</Text>
		)}
		{children}
	</View>
);

export type InlineCitationQuoteProps = React.ComponentProps<typeof View>;

export const InlineCitationQuote = ({
	children,
	className,
	...props
}: InlineCitationQuoteProps) => (
	<View className={cn("border-muted border-l-2 pl-3", className)} {...props}>
		<Text className="text-muted-foreground text-sm italic">{children}</Text>
	</View>
);
