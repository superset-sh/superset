import { Image as ExpoImage } from "expo-image";
import type { LucideIcon } from "lucide-react-native";
import {
	FileTextIcon,
	GlobeIcon,
	ImageIcon,
	Music2Icon,
	PaperclipIcon,
	VideoIcon,
	XIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import type { GestureResponderEvent } from "react-native";
import { View } from "react-native";
import { withUniwind } from "uniwind";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const StyledImage = withUniwind(ExpoImage);

// ============================================================================
// Types
// ============================================================================

export type FileUIPart = {
	type: "file";
	mediaType: string;
	filename?: string;
	url: string;
};

export type SourceDocumentUIPart = {
	type: "source-document";
	sourceId: string;
	mediaType: string;
	title: string;
	filename?: string;
};

export type AttachmentData =
	| (FileUIPart & { id: string })
	| (SourceDocumentUIPart & { id: string });

export type AttachmentMediaCategory =
	| "image"
	| "video"
	| "audio"
	| "document"
	| "source"
	| "unknown";

export type AttachmentVariant = "grid" | "inline" | "list";

const mediaCategoryIcons: Record<AttachmentMediaCategory, LucideIcon> = {
	audio: Music2Icon,
	document: FileTextIcon,
	image: ImageIcon,
	source: GlobeIcon,
	unknown: PaperclipIcon,
	video: VideoIcon,
};

// ============================================================================
// Utility Functions
// ============================================================================

export const getMediaCategory = (
	data: AttachmentData,
): AttachmentMediaCategory => {
	if (data.type === "source-document") {
		return "source";
	}

	const mediaType = data.mediaType ?? "";

	if (mediaType.startsWith("image/")) {
		return "image";
	}
	if (mediaType.startsWith("video/")) {
		return "video";
	}
	if (mediaType.startsWith("audio/")) {
		return "audio";
	}
	if (mediaType.startsWith("application/") || mediaType.startsWith("text/")) {
		return "document";
	}

	return "unknown";
};

export const getAttachmentLabel = (data: AttachmentData): string => {
	if (data.type === "source-document") {
		return data.title || data.filename || "Source";
	}

	const category = getMediaCategory(data);
	return data.filename || (category === "image" ? "Image" : "Attachment");
};

// ============================================================================
// Contexts
// ============================================================================

interface AttachmentsContextValue {
	variant: AttachmentVariant;
}

const AttachmentsContext = createContext<AttachmentsContextValue | null>(null);

interface AttachmentContextValue {
	data: AttachmentData;
	mediaCategory: AttachmentMediaCategory;
	onRemove?: () => void;
	variant: AttachmentVariant;
}

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

// ============================================================================
// Hooks
// ============================================================================

export const useAttachmentsContext = () =>
	useContext(AttachmentsContext) ?? { variant: "grid" as const };

export const useAttachmentContext = () => {
	const ctx = useContext(AttachmentContext);
	if (!ctx) {
		throw new Error("Attachment components must be used within <Attachment>");
	}
	return ctx;
};

// ============================================================================
// Attachments - Container
// ============================================================================

export type AttachmentsProps = React.ComponentProps<typeof View> & {
	variant?: AttachmentVariant;
};

export const Attachments = ({
	variant = "grid",
	className,
	children,
	...props
}: AttachmentsProps) => {
	const contextValue = useMemo(() => ({ variant }), [variant]);

	return (
		<AttachmentsContext.Provider value={contextValue}>
			<View
				className={cn(
					"items-start",
					variant === "list" ? "flex-col gap-2" : "flex-row flex-wrap gap-2",
					variant === "grid" && "ml-auto",
					className,
				)}
				{...props}
			>
				{children}
			</View>
		</AttachmentsContext.Provider>
	);
};

// ============================================================================
// Attachment - Item
// ============================================================================

export type AttachmentProps = React.ComponentProps<typeof View> & {
	data: AttachmentData;
	onRemove?: () => void;
};

export const Attachment = ({
	data,
	onRemove,
	className,
	children,
	...props
}: AttachmentProps) => {
	const { variant } = useAttachmentsContext();
	const mediaCategory = getMediaCategory(data);

	const contextValue = useMemo<AttachmentContextValue>(
		() => ({ data, mediaCategory, onRemove, variant }),
		[data, mediaCategory, onRemove, variant],
	);

	return (
		<AttachmentContext.Provider value={contextValue}>
			<View
				className={cn(
					"relative",
					variant === "grid" && "size-24 overflow-hidden rounded-lg",
					variant === "inline" &&
						"h-8 flex-row items-center gap-1.5 rounded-md border border-border px-1.5",
					variant === "list" &&
						"w-full flex-row items-center gap-3 rounded-lg border border-border p-3",
					className,
				)}
				{...props}
			>
				{children}
			</View>
		</AttachmentContext.Provider>
	);
};

// ============================================================================
// AttachmentPreview - Media preview
// ============================================================================

export type AttachmentPreviewProps = React.ComponentProps<typeof View> & {
	fallbackIcon?: ReactNode;
};

export const AttachmentPreview = ({
	fallbackIcon,
	className,
	...props
}: AttachmentPreviewProps) => {
	const { data, mediaCategory, variant } = useAttachmentContext();

	const iconSize = variant === "inline" ? "size-3" : "size-4";

	const renderContent = () => {
		if (mediaCategory === "image" && data.type === "file" && data.url) {
			return (
				<StyledImage
					accessibilityLabel={data.filename || "Image"}
					className={cn("size-full", variant !== "grid" && "rounded")}
					contentFit="cover"
					source={{ uri: data.url }}
				/>
			);
		}

		const FallbackIcon = mediaCategoryIcons[mediaCategory];
		return (
			fallbackIcon ?? (
				<Icon
					as={FallbackIcon}
					className={cn(iconSize, "text-muted-foreground")}
				/>
			)
		);
	};

	return (
		<View
			className={cn(
				"shrink-0 items-center justify-center overflow-hidden",
				variant === "grid" && "size-full bg-muted",
				variant === "inline" && "size-5 rounded bg-background",
				variant === "list" && "size-12 rounded bg-muted",
				className,
			)}
			{...props}
		>
			{renderContent()}
		</View>
	);
};

// ============================================================================
// AttachmentInfo - Name and type display
// ============================================================================

export type AttachmentInfoProps = React.ComponentProps<typeof View> & {
	showMediaType?: boolean;
};

export const AttachmentInfo = ({
	showMediaType = false,
	className,
	...props
}: AttachmentInfoProps) => {
	const { data, variant } = useAttachmentContext();
	const label = getAttachmentLabel(data);

	if (variant === "grid") {
		return null;
	}

	return (
		<View className={cn("min-w-0 flex-1", className)} {...props}>
			<Text className="font-medium text-sm" numberOfLines={1}>
				{label}
			</Text>
			{showMediaType && data.mediaType && (
				<Text className="text-muted-foreground text-xs" numberOfLines={1}>
					{data.mediaType}
				</Text>
			)}
		</View>
	);
};

// ============================================================================
// AttachmentRemove - Remove button
// ============================================================================

export type AttachmentRemoveProps = ButtonProps & {
	label?: string;
};

export const AttachmentRemove = ({
	label = "Remove",
	className,
	children,
	...props
}: AttachmentRemoveProps) => {
	const { onRemove, variant } = useAttachmentContext();

	const handlePress = useCallback(
		(event: GestureResponderEvent) => {
			event.stopPropagation();
			onRemove?.();
		},
		[onRemove],
	);

	if (!onRemove) {
		return null;
	}

	return (
		<Button
			accessibilityLabel={label}
			className={cn(
				variant === "grid" &&
					"absolute top-1 right-1 size-6 rounded-full bg-background/80",
				variant === "inline" && "size-5 rounded",
				variant === "list" && "size-8 shrink-0 rounded",
				className,
			)}
			onPress={handlePress}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ?? (
				<Icon
					as={XIcon}
					className={cn(
						variant === "list" ? "size-4" : "size-3",
						"text-muted-foreground",
					)}
				/>
			)}
		</Button>
	);
};

// ============================================================================
// AttachmentHoverCard - Press-to-preview card
// ============================================================================

export type AttachmentHoverCardProps = React.ComponentProps<typeof HoverCard>;

export const AttachmentHoverCard = ({
	openDelay = 0,
	closeDelay = 0,
	...props
}: AttachmentHoverCardProps) => (
	<HoverCard closeDelay={closeDelay} openDelay={openDelay} {...props} />
);

export type AttachmentHoverCardTriggerProps = React.ComponentProps<
	typeof HoverCardTrigger
>;

export const AttachmentHoverCardTrigger = (
	props: AttachmentHoverCardTriggerProps,
) => <HoverCardTrigger {...props} />;

export type AttachmentHoverCardContentProps = React.ComponentProps<
	typeof HoverCardContent
>;

export const AttachmentHoverCardContent = ({
	align = "start",
	className,
	...props
}: AttachmentHoverCardContentProps) => (
	<HoverCardContent
		align={align}
		className={cn("w-auto p-2", className)}
		{...props}
	/>
);

// ============================================================================
// AttachmentEmpty - Empty state
// ============================================================================

export type AttachmentEmptyProps = React.ComponentProps<typeof View>;

export const AttachmentEmpty = ({
	className,
	children,
	...props
}: AttachmentEmptyProps) => (
	<View className={cn("items-center justify-center p-4", className)} {...props}>
		{children ?? (
			<Text className="text-muted-foreground text-sm">No attachments</Text>
		)}
	</View>
);
