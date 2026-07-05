import * as Clipboard from "expo-clipboard";
import {
	CheckIcon,
	CopyIcon,
	FileIcon,
	GitCommitIcon,
	MinusIcon,
	PlusIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const renderTextChildren = (children: ReactNode, className: string) =>
	typeof children === "string" || typeof children === "number" ? (
		<Text className={className}>{children}</Text>
	) : (
		children
	);

export type CommitProps = React.ComponentProps<typeof Collapsible>;

export const Commit = ({ className, children, ...props }: CommitProps) => (
	<Collapsible
		className={cn("rounded-lg border border-border bg-background", className)}
		{...props}
	>
		{children}
	</Collapsible>
);

export type CommitHeaderProps = React.ComponentProps<typeof CollapsibleTrigger>;

export const CommitHeader = ({
	className,
	children,
	...props
}: CommitHeaderProps) => (
	<CollapsibleTrigger
		className={cn(
			"w-full flex-row items-center justify-between gap-4 p-3",
			className,
		)}
		{...props}
	>
		{children}
	</CollapsibleTrigger>
);

export type CommitHashProps = React.ComponentProps<typeof View>;

export const CommitHash = ({
	className,
	children,
	...props
}: CommitHashProps) => (
	<View className={cn("flex-row items-center", className)} {...props}>
		<Icon as={GitCommitIcon} className="mr-1 size-3" />
		{renderTextChildren(children, "font-mono text-xs")}
	</View>
);

export type CommitMessageProps = React.ComponentProps<typeof Text>;

export const CommitMessage = ({
	className,
	children,
	...props
}: CommitMessageProps) => (
	<Text className={cn("font-medium text-sm", className)} {...props}>
		{children}
	</Text>
);

export type CommitMetadataProps = React.ComponentProps<typeof View>;

export const CommitMetadata = ({
	className,
	children,
	...props
}: CommitMetadataProps) => (
	<TextClassContext.Provider value="text-muted-foreground text-xs">
		<View className={cn("flex-row items-center gap-2", className)} {...props}>
			{children}
		</View>
	</TextClassContext.Provider>
);

export type CommitSeparatorProps = React.ComponentProps<typeof Text>;

export const CommitSeparator = ({
	className,
	children,
	...props
}: CommitSeparatorProps) => (
	<Text className={className} {...props}>
		{children ?? "•"}
	</Text>
);

export type CommitInfoProps = React.ComponentProps<typeof View>;

export const CommitInfo = ({
	className,
	children,
	...props
}: CommitInfoProps) => (
	<View className={cn("flex-1", className)} {...props}>
		{children}
	</View>
);

export type CommitAuthorProps = React.ComponentProps<typeof View>;

export const CommitAuthor = ({
	className,
	children,
	...props
}: CommitAuthorProps) => (
	<View className={cn("flex-row items-center", className)} {...props}>
		{children}
	</View>
);

export type CommitAuthorAvatarProps = Omit<
	React.ComponentProps<typeof Avatar>,
	"alt"
> & {
	initials: string;
	alt?: string;
};

export const CommitAuthorAvatar = ({
	initials,
	alt,
	className,
	...props
}: CommitAuthorAvatarProps) => (
	<Avatar alt={alt ?? initials} className={cn("size-8", className)} {...props}>
		<AvatarFallback>
			<Text className="text-xs">{initials}</Text>
		</AvatarFallback>
	</Avatar>
);

export type CommitTimestampProps = React.ComponentProps<typeof Text> & {
	date: Date;
};

const formatRelativeDate = (date: Date) => {
	const days = Math.round(
		(date.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
	);
	if (days === 0) {
		return "today";
	}
	if (days === -1) {
		return "yesterday";
	}
	if (days === 1) {
		return "tomorrow";
	}
	return days < 0 ? `${-days} days ago` : `in ${days} days`;
};

export const CommitTimestamp = ({
	date,
	className,
	children,
	...props
}: CommitTimestampProps) => (
	<Text className={cn("text-xs", className)} {...props}>
		{children ?? formatRelativeDate(date)}
	</Text>
);

export type CommitActionsProps = React.ComponentProps<typeof View>;

export const CommitActions = ({
	className,
	children,
	...props
}: CommitActionsProps) => (
	<View className={cn("flex-row items-center gap-1", className)} {...props}>
		{children}
	</View>
);

export type CommitCopyButtonProps = ButtonProps & {
	hash: string;
	onCopy?: () => void;
	onError?: (error: Error) => void;
	timeout?: number;
};

export const CommitCopyButton = ({
	hash,
	onCopy,
	onError,
	timeout = 2000,
	children,
	className,
	...props
}: CommitCopyButtonProps) => {
	const [isCopied, setIsCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const copyToClipboard = useCallback(async () => {
		if (isCopied) {
			return;
		}
		try {
			await Clipboard.setStringAsync(hash);
			setIsCopied(true);
			onCopy?.();
			timeoutRef.current = setTimeout(() => setIsCopied(false), timeout);
		} catch (error) {
			onError?.(error as Error);
		}
	}, [hash, onCopy, onError, timeout, isCopied]);

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
			className={cn("size-7 shrink-0", className)}
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
};

export type CommitContentProps = React.ComponentProps<
	typeof CollapsibleContent
>;

export const CommitContent = ({
	className,
	children,
	...props
}: CommitContentProps) => (
	<CollapsibleContent
		className={cn("border-border border-t p-3", className)}
		{...props}
	>
		{children}
	</CollapsibleContent>
);

export type CommitFilesProps = React.ComponentProps<typeof View>;

export const CommitFiles = ({
	className,
	children,
	...props
}: CommitFilesProps) => (
	<View className={cn("gap-1", className)} {...props}>
		{children}
	</View>
);

export type CommitFileProps = React.ComponentProps<typeof View>;

export const CommitFile = ({
	className,
	children,
	...props
}: CommitFileProps) => (
	<View
		className={cn(
			"flex-row items-center justify-between gap-2 rounded px-2 py-1",
			className,
		)}
		{...props}
	>
		{children}
	</View>
);

export type CommitFileInfoProps = React.ComponentProps<typeof View>;

export const CommitFileInfo = ({
	className,
	children,
	...props
}: CommitFileInfoProps) => (
	<View
		className={cn("min-w-0 shrink flex-row items-center gap-2", className)}
		{...props}
	>
		{children}
	</View>
);

const fileStatusStyles = {
	added: "text-green-600 dark:text-green-400",
	deleted: "text-red-600 dark:text-red-400",
	modified: "text-yellow-600 dark:text-yellow-400",
	renamed: "text-blue-600 dark:text-blue-400",
};

const fileStatusLabels = {
	added: "A",
	deleted: "D",
	modified: "M",
	renamed: "R",
};

export type CommitFileStatusProps = React.ComponentProps<typeof Text> & {
	status: "added" | "modified" | "deleted" | "renamed";
};

export const CommitFileStatus = ({
	status,
	className,
	children,
	...props
}: CommitFileStatusProps) => (
	<Text
		className={cn(
			"font-medium font-mono text-xs",
			fileStatusStyles[status],
			className,
		)}
		{...props}
	>
		{children ?? fileStatusLabels[status]}
	</Text>
);

export type CommitFileIconProps = Omit<React.ComponentProps<typeof Icon>, "as">;

export const CommitFileIcon = ({
	className,
	...props
}: CommitFileIconProps) => (
	<Icon
		as={FileIcon}
		className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
		{...props}
	/>
);

export type CommitFilePathProps = React.ComponentProps<typeof Text>;

export const CommitFilePath = ({
	className,
	children,
	...props
}: CommitFilePathProps) => (
	<Text
		className={cn("shrink font-mono text-xs", className)}
		numberOfLines={1}
		{...props}
	>
		{children}
	</Text>
);

export type CommitFileChangesProps = React.ComponentProps<typeof View>;

export const CommitFileChanges = ({
	className,
	children,
	...props
}: CommitFileChangesProps) => (
	<TextClassContext.Provider value="font-mono text-xs">
		<View
			className={cn("shrink-0 flex-row items-center gap-1", className)}
			{...props}
		>
			{children}
		</View>
	</TextClassContext.Provider>
);

export type CommitFileAdditionsProps = React.ComponentProps<typeof View> & {
	count: number;
};

export const CommitFileAdditions = ({
	count,
	className,
	children,
	...props
}: CommitFileAdditionsProps) => {
	if (count <= 0) {
		return null;
	}

	return (
		<View className={cn("flex-row items-center", className)} {...props}>
			{renderTextChildren(children, "text-green-600 dark:text-green-400") ?? (
				<>
					<Icon
						as={PlusIcon}
						className="size-3 text-green-600 dark:text-green-400"
					/>
					<Text className="text-green-600 dark:text-green-400">{count}</Text>
				</>
			)}
		</View>
	);
};

export type CommitFileDeletionsProps = React.ComponentProps<typeof View> & {
	count: number;
};

export const CommitFileDeletions = ({
	count,
	className,
	children,
	...props
}: CommitFileDeletionsProps) => {
	if (count <= 0) {
		return null;
	}

	return (
		<View className={cn("flex-row items-center", className)} {...props}>
			{renderTextChildren(children, "text-red-600 dark:text-red-400") ?? (
				<>
					<Icon
						as={MinusIcon}
						className="size-3 text-red-600 dark:text-red-400"
					/>
					<Text className="text-red-600 dark:text-red-400">{count}</Text>
				</>
			)}
		</View>
	);
};
