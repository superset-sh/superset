import { useControllableState } from "@rn-primitives/hooks";
import { ChevronDownIcon, PaperclipIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import { Image, ScrollView, View } from "react-native";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export interface QueueMessagePart {
	type: string;
	text?: string;
	url?: string;
	filename?: string;
	mediaType?: string;
}

export interface QueueMessage {
	id: string;
	parts: QueueMessagePart[];
}

export interface QueueTodo {
	id: string;
	title: string;
	description?: string;
	status?: "pending" | "completed";
}

export type QueueItemProps = React.ComponentProps<typeof View>;

export const QueueItem = ({ className, ...props }: QueueItemProps) => (
	<View
		className={cn("flex-col gap-1 rounded-md px-3 py-1", className)}
		{...props}
	/>
);

export type QueueItemIndicatorProps = React.ComponentProps<typeof View> & {
	completed?: boolean;
};

export const QueueItemIndicator = ({
	completed = false,
	className,
	...props
}: QueueItemIndicatorProps) => (
	<View
		className={cn(
			"mt-0.5 size-2.5 rounded-full border",
			completed
				? "border-muted-foreground/20 bg-muted-foreground/10"
				: "border-muted-foreground/50",
			className,
		)}
		{...props}
	/>
);

export type QueueItemContentProps = React.ComponentProps<typeof Text> & {
	completed?: boolean;
};

export const QueueItemContent = ({
	completed = false,
	className,
	...props
}: QueueItemContentProps) => (
	<Text
		className={cn(
			"shrink grow text-sm",
			completed
				? "text-muted-foreground/50 line-through"
				: "text-muted-foreground",
			className,
		)}
		numberOfLines={1}
		{...props}
	/>
);

export type QueueItemDescriptionProps = React.ComponentProps<typeof Text> & {
	completed?: boolean;
};

export const QueueItemDescription = ({
	completed = false,
	className,
	...props
}: QueueItemDescriptionProps) => (
	<Text
		className={cn(
			"ml-6 text-xs",
			completed
				? "text-muted-foreground/40 line-through"
				: "text-muted-foreground",
			className,
		)}
		{...props}
	/>
);

export type QueueItemActionsProps = React.ComponentProps<typeof View>;

export const QueueItemActions = ({
	className,
	...props
}: QueueItemActionsProps) => (
	<View className={cn("flex-row gap-1", className)} {...props} />
);

export type QueueItemActionProps = Omit<ButtonProps, "variant" | "size">;

export const QueueItemAction = ({
	className,
	...props
}: QueueItemActionProps) => (
	<Button
		className={cn("h-auto w-auto rounded p-1", className)}
		size="icon"
		variant="ghost"
		{...props}
	/>
);

export type QueueItemAttachmentProps = React.ComponentProps<typeof View>;

export const QueueItemAttachment = ({
	className,
	...props
}: QueueItemAttachmentProps) => (
	<View className={cn("mt-1 flex-row flex-wrap gap-2", className)} {...props} />
);

export type QueueItemImageProps = React.ComponentProps<typeof Image>;

export const QueueItemImage = ({
	className,
	...props
}: QueueItemImageProps) => (
	<Image
		accessibilityIgnoresInvertColors
		className={cn("h-8 w-8 rounded border border-border", className)}
		height={32}
		resizeMode="cover"
		width={32}
		{...props}
	/>
);

export type QueueItemFileProps = React.ComponentProps<typeof View>;

export const QueueItemFile = ({
	children,
	className,
	...props
}: QueueItemFileProps) => (
	<View
		className={cn(
			"flex-row items-center gap-1 rounded border border-border bg-muted px-2 py-1",
			className,
		)}
		{...props}
	>
		<Icon as={PaperclipIcon} className="size-3 text-muted-foreground" />
		<Text className="max-w-[100px] text-xs" numberOfLines={1}>
			{children}
		</Text>
	</View>
);

export type QueueListProps = React.ComponentProps<typeof ScrollView>;

export const QueueList = ({
	children,
	className,
	...props
}: QueueListProps) => (
	<ScrollView className={cn("-mb-1 mt-2 max-h-40", className)} {...props}>
		<View>{children}</View>
	</ScrollView>
);

interface QueueSectionContextValue {
	isOpen: boolean;
}

const QueueSectionContext = createContext<QueueSectionContextValue | null>(
	null,
);

const useQueueSection = () => {
	const context = useContext(QueueSectionContext);
	if (!context) {
		throw new Error("QueueSection components must be used within QueueSection");
	}
	return context;
};

export type QueueSectionProps = React.ComponentProps<typeof Collapsible>;

export const QueueSection = ({
	className,
	defaultOpen = true,
	open,
	onOpenChange,
	...props
}: QueueSectionProps) => {
	const [isOpenState, setIsOpen] = useControllableState<boolean>({
		defaultProp: defaultOpen,
		onChange: onOpenChange,
		prop: open,
	});
	const isOpen = isOpenState ?? false;
	const contextValue = useMemo(() => ({ isOpen }), [isOpen]);

	return (
		<QueueSectionContext.Provider value={contextValue}>
			<Collapsible
				className={cn(className)}
				onOpenChange={setIsOpen}
				open={isOpen}
				{...props}
			/>
		</QueueSectionContext.Provider>
	);
};

export type QueueSectionTriggerProps = React.ComponentProps<
	typeof CollapsibleTrigger
>;

export const QueueSectionTrigger = ({
	children,
	className,
	...props
}: QueueSectionTriggerProps) => (
	<TextClassContext.Provider value="font-medium text-muted-foreground text-sm">
		<CollapsibleTrigger
			className={cn(
				"w-full flex-row items-center justify-between rounded-md bg-muted/40 px-3 py-2",
				className,
			)}
			{...props}
		>
			{children}
		</CollapsibleTrigger>
	</TextClassContext.Provider>
);

export type QueueSectionLabelProps = React.ComponentProps<typeof View> & {
	count?: number;
	label: string;
	icon?: ReactNode;
};

export const QueueSectionLabel = ({
	count,
	label,
	icon,
	className,
	...props
}: QueueSectionLabelProps) => {
	const { isOpen } = useQueueSection();

	return (
		<View className={cn("flex-row items-center gap-2", className)} {...props}>
			<View style={isOpen ? undefined : { transform: [{ rotate: "-90deg" }] }}>
				<Icon as={ChevronDownIcon} className="size-4 text-muted-foreground" />
			</View>
			{icon}
			<Text>
				{count} {label}
			</Text>
		</View>
	);
};

export type QueueSectionContentProps = React.ComponentProps<
	typeof CollapsibleContent
>;

export const QueueSectionContent = ({
	className,
	...props
}: QueueSectionContentProps) => (
	<CollapsibleContent className={cn(className)} {...props} />
);

export type QueueProps = React.ComponentProps<typeof View>;

export const Queue = ({ className, ...props }: QueueProps) => (
	<View
		className={cn(
			"flex-col gap-2 rounded-xl border border-border bg-background px-3 pt-2 pb-2",
			className,
		)}
		{...props}
	/>
);
