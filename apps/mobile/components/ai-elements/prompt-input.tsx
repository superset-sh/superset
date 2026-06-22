import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import {
	ArrowUpIcon,
	ImageIcon,
	PaperclipIcon,
	PlusIcon,
	RotateCcwIcon,
	SquareIcon,
	XIcon,
} from "lucide-react-native";
import type { PropsWithChildren, ReactNode } from "react";
import {
	Children,
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type {
	NativeSyntheticEvent,
	TextInputContentSizeChangeEventData,
	TextInputKeyPressEventData,
} from "react-native";
import { Pressable, View } from "react-native";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ChatStatus = "submitted" | "streaming" | "ready" | "error";

export interface PromptInputAttachmentItem {
	id: string;
	type: "image" | "file";
	uri: string;
	name?: string;
	mediaType?: string;
	size?: number;
}

export type PromptInputAttachmentInput = Omit<PromptInputAttachmentItem, "id">;

export interface AttachmentsContext {
	attachments: PromptInputAttachmentItem[];
	add: (items: PromptInputAttachmentInput[]) => void;
	remove: (id: string) => void;
	clear: () => void;
	openImagePicker: () => Promise<void>;
	openFilePicker: () => Promise<void>;
}

export interface TextInputContext {
	value: string;
	setInput: (value: string) => void;
	clear: () => void;
}

export interface PromptInputControllerProps {
	textInput: TextInputContext;
	attachments: AttachmentsContext;
}

let attachmentIdCounter = 0;

const createAttachmentId = () => {
	attachmentIdCounter += 1;
	return `attachment-${Date.now()}-${attachmentIdCounter}`;
};

const imageAssetToAttachment = (
	asset: ImagePicker.ImagePickerAsset,
): PromptInputAttachmentInput => ({
	mediaType: asset.mimeType,
	name: asset.fileName ?? undefined,
	size: asset.fileSize,
	type: "image",
	uri: asset.uri,
});

const documentAssetToAttachment = (
	asset: DocumentPicker.DocumentPickerAsset,
): PromptInputAttachmentInput => ({
	mediaType: asset.mimeType,
	name: asset.name,
	size: asset.size,
	type: asset.mimeType?.startsWith("image/") ? "image" : "file",
	uri: asset.uri,
});

const useAttachmentsContextValue = (): AttachmentsContext => {
	const [attachments, setAttachments] = useState<PromptInputAttachmentItem[]>(
		[],
	);

	const add = useCallback((items: PromptInputAttachmentInput[]) => {
		if (items.length === 0) {
			return;
		}
		setAttachments((previous) => [
			...previous,
			...items.map((item) => ({ ...item, id: createAttachmentId() })),
		]);
	}, []);

	const remove = useCallback((id: string) => {
		setAttachments((previous) => previous.filter((item) => item.id !== id));
	}, []);

	const clear = useCallback(() => setAttachments([]), []);

	const openImagePicker = useCallback(async () => {
		try {
			const result = await ImagePicker.launchImageLibraryAsync({
				allowsMultipleSelection: true,
				mediaTypes: ["images"],
				quality: 0.8,
			});
			if (result.canceled) {
				return;
			}
			add(result.assets.map(imageAssetToAttachment));
		} catch {}
	}, [add]);

	const openFilePicker = useCallback(async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({ multiple: true });
			if (result.canceled) {
				return;
			}
			add(result.assets.map(documentAssetToAttachment));
		} catch {}
	}, [add]);

	return useMemo(
		() => ({
			add,
			attachments,
			clear,
			openFilePicker,
			openImagePicker,
			remove,
		}),
		[add, attachments, clear, openFilePicker, openImagePicker, remove],
	);
};

const PromptInputController = createContext<PromptInputControllerProps | null>(
	null,
);
const ProviderAttachmentsContext = createContext<AttachmentsContext | null>(
	null,
);
const LocalAttachmentsContext = createContext<AttachmentsContext | null>(null);

interface PromptInputFormContextType {
	textInput: TextInputContext;
	attachments: AttachmentsContext;
	submit: () => void;
	canSubmit: boolean;
}

const PromptInputFormContext = createContext<PromptInputFormContextType | null>(
	null,
);

export const usePromptInputController = () => {
	const context = useContext(PromptInputController);
	if (!context) {
		throw new Error(
			"Wrap your component inside <PromptInputProvider> to use usePromptInputController().",
		);
	}
	return context;
};

const useOptionalPromptInputController = () =>
	useContext(PromptInputController);

export const useProviderAttachments = () => {
	const context = useContext(ProviderAttachmentsContext);
	if (!context) {
		throw new Error(
			"Wrap your component inside <PromptInputProvider> to use useProviderAttachments().",
		);
	}
	return context;
};

export const usePromptInputAttachments = () => {
	const provider = useContext(ProviderAttachmentsContext);
	const local = useContext(LocalAttachmentsContext);
	const context = local ?? provider;
	if (!context) {
		throw new Error(
			"usePromptInputAttachments must be used within a PromptInput or PromptInputProvider",
		);
	}
	return context;
};

const usePromptInputForm = () => {
	const context = useContext(PromptInputFormContext);
	if (!context) {
		throw new Error("PromptInput components must be used within a PromptInput");
	}
	return context;
};

export type PromptInputProviderProps = PropsWithChildren<{
	initialInput?: string;
}>;

export const PromptInputProvider = ({
	initialInput = "",
	children,
}: PromptInputProviderProps) => {
	const [textInput, setTextInput] = useState(initialInput);
	const clearInput = useCallback(() => setTextInput(""), []);
	const attachments = useAttachmentsContextValue();

	const controller = useMemo<PromptInputControllerProps>(
		() => ({
			attachments,
			textInput: {
				clear: clearInput,
				setInput: setTextInput,
				value: textInput,
			},
		}),
		[attachments, clearInput, textInput],
	);

	return (
		<PromptInputController.Provider value={controller}>
			<ProviderAttachmentsContext.Provider value={attachments}>
				{children}
			</ProviderAttachmentsContext.Provider>
		</PromptInputController.Provider>
	);
};

export interface PromptInputMessage {
	text: string;
	attachments: PromptInputAttachmentItem[];
}

export type PromptInputProps = React.ComponentProps<typeof View> & {
	onSubmit: (message: PromptInputMessage) => void | Promise<void>;
};

export const PromptInput = ({
	className,
	onSubmit,
	children,
	...props
}: PromptInputProps) => {
	const controller = useOptionalPromptInputController();
	const localAttachments = useAttachmentsContextValue();
	const [localText, setLocalText] = useState("");
	const clearLocalText = useCallback(() => setLocalText(""), []);

	const attachments = controller?.attachments ?? localAttachments;
	const textInput = useMemo<TextInputContext>(
		() =>
			controller?.textInput ?? {
				clear: clearLocalText,
				setInput: setLocalText,
				value: localText,
			},
		[controller?.textInput, clearLocalText, localText],
	);

	const canSubmit =
		textInput.value.trim().length > 0 || attachments.attachments.length > 0;

	const submit = useCallback(() => {
		if (
			textInput.value.trim().length === 0 &&
			attachments.attachments.length === 0
		) {
			return;
		}

		const message: PromptInputMessage = {
			attachments: attachments.attachments,
			text: textInput.value,
		};

		const clearAll = () => {
			attachments.clear();
			textInput.clear();
		};

		try {
			const result = onSubmit(message);
			if (result instanceof Promise) {
				result.then(clearAll).catch(() => {});
			} else {
				clearAll();
			}
		} catch {}
	}, [attachments, onSubmit, textInput]);

	const form = useMemo<PromptInputFormContextType>(
		() => ({ attachments, canSubmit, submit, textInput }),
		[attachments, canSubmit, submit, textInput],
	);

	return (
		<LocalAttachmentsContext.Provider value={attachments}>
			<PromptInputFormContext.Provider value={form}>
				<View
					className={cn(
						"w-full overflow-hidden rounded-xl border border-border bg-card",
						className,
					)}
					{...props}
				>
					{children}
				</View>
			</PromptInputFormContext.Provider>
		</LocalAttachmentsContext.Provider>
	);
};

export type PromptInputBodyProps = React.ComponentProps<typeof View>;

export const PromptInputBody = ({
	className,
	...props
}: PromptInputBodyProps) => (
	<View className={cn("flex-col", className)} {...props} />
);

export type PromptInputHeaderProps = React.ComponentProps<typeof View>;

export const PromptInputHeader = ({
	className,
	...props
}: PromptInputHeaderProps) => (
	<View
		className={cn("flex-row flex-wrap items-center gap-1 px-3 pt-3", className)}
		{...props}
	/>
);

export type PromptInputFooterProps = React.ComponentProps<typeof View>;

export const PromptInputFooter = ({
	className,
	...props
}: PromptInputFooterProps) => (
	<View
		className={cn("flex-row items-center justify-between gap-1 p-2", className)}
		{...props}
	/>
);

export type PromptInputToolsProps = React.ComponentProps<typeof View>;

export const PromptInputTools = ({
	className,
	...props
}: PromptInputToolsProps) => (
	<View
		className={cn("min-w-0 flex-row items-center gap-1", className)}
		{...props}
	/>
);

export type PromptInputAttachmentProps = React.ComponentProps<typeof View> & {
	data: PromptInputAttachmentItem;
};

export const PromptInputAttachment = ({
	data,
	className,
	...props
}: PromptInputAttachmentProps) => {
	const attachments = usePromptInputAttachments();
	const handleRemove = useCallback(
		() => attachments.remove(data.id),
		[attachments, data.id],
	);

	if (data.type === "image") {
		return (
			<View className={cn("relative", className)} {...props}>
				<Image
					accessibilityLabel={data.name ?? "Image attachment"}
					contentFit="cover"
					source={{ uri: data.uri }}
					style={{ borderRadius: 8, height: 56, width: 56 }}
				/>
				<Pressable
					accessibilityLabel="Remove attachment"
					className="-right-1.5 -top-1.5 absolute size-5 items-center justify-center rounded-full border border-border bg-secondary"
					hitSlop={8}
					onPress={handleRemove}
				>
					<Icon as={XIcon} className="size-3 text-secondary-foreground" />
				</Pressable>
			</View>
		);
	}

	return (
		<View
			className={cn(
				"flex-row items-center gap-1.5 rounded-md border border-border bg-secondary py-1.5 pr-1 pl-2",
				className,
			)}
			{...props}
		>
			<Icon as={PaperclipIcon} className="size-3.5 text-muted-foreground" />
			<Text
				className="max-w-32 text-secondary-foreground text-xs"
				numberOfLines={1}
			>
				{data.name ?? data.uri}
			</Text>
			<Pressable
				accessibilityLabel="Remove attachment"
				className="size-5 items-center justify-center rounded-sm"
				hitSlop={8}
				onPress={handleRemove}
			>
				<Icon as={XIcon} className="size-3 text-muted-foreground" />
			</Pressable>
		</View>
	);
};

export type PromptInputAttachmentsProps = Omit<
	React.ComponentProps<typeof View>,
	"children"
> & {
	children?: (attachment: PromptInputAttachmentItem) => ReactNode;
};

export const PromptInputAttachments = ({
	className,
	children,
	...props
}: PromptInputAttachmentsProps) => {
	const attachments = usePromptInputAttachments();

	if (attachments.attachments.length === 0) {
		return null;
	}

	return (
		<View
			className={cn("flex-row flex-wrap gap-2 px-3 pt-3", className)}
			{...props}
		>
			{attachments.attachments.map((attachment) =>
				children ? (
					children(attachment)
				) : (
					<PromptInputAttachment data={attachment} key={attachment.id} />
				),
			)}
		</View>
	);
};

const TEXTAREA_MIN_HEIGHT = 44;
const TEXTAREA_MAX_HEIGHT = 140;

export type PromptInputTextareaProps = React.ComponentProps<typeof Textarea>;

export const PromptInputTextarea = ({
	onChangeText,
	onKeyPress,
	onContentSizeChange,
	className,
	style,
	placeholder = "What would you like to know?",
	...props
}: PromptInputTextareaProps) => {
	const { textInput } = usePromptInputForm();
	const attachments = usePromptInputAttachments();
	const [contentHeight, setContentHeight] = useState(TEXTAREA_MIN_HEIGHT);

	const handleChangeText = useCallback(
		(value: string) => {
			textInput.setInput(value);
			onChangeText?.(value);
		},
		[onChangeText, textInput],
	);

	const handleKeyPress = useCallback(
		(event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
			onKeyPress?.(event);
			if (
				event.nativeEvent.key === "Backspace" &&
				textInput.value === "" &&
				attachments.attachments.length > 0
			) {
				const lastAttachment = attachments.attachments.at(-1);
				if (lastAttachment) {
					attachments.remove(lastAttachment.id);
				}
			}
		},
		[attachments, onKeyPress, textInput.value],
	);

	const handleContentSizeChange = useCallback(
		(event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
			setContentHeight(event.nativeEvent.contentSize.height);
			onContentSizeChange?.(event);
		},
		[onContentSizeChange],
	);

	const height = Math.min(
		Math.max(contentHeight, TEXTAREA_MIN_HEIGHT),
		TEXTAREA_MAX_HEIGHT,
	);

	return (
		<Textarea
			className={cn(
				"min-h-0 border-0 bg-transparent px-4 py-3 text-base text-foreground shadow-none dark:bg-transparent",
				className,
			)}
			onChangeText={handleChangeText}
			onContentSizeChange={handleContentSizeChange}
			onKeyPress={handleKeyPress}
			placeholder={placeholder}
			style={[{ height }, style]}
			value={textInput.value}
			{...props}
		/>
	);
};

export type PromptInputButtonProps = ButtonProps;

export const PromptInputButton = ({
	variant = "ghost",
	size,
	className,
	...props
}: PromptInputButtonProps) => {
	const newSize = size ?? (Children.count(props.children) > 1 ? "sm" : "icon");

	return (
		<Button
			className={cn("rounded-lg", className)}
			size={newSize}
			variant={variant}
			{...props}
		/>
	);
};

export type PromptInputActionMenuProps = React.ComponentProps<
	typeof DropdownMenu
>;

export const PromptInputActionMenu = (props: PromptInputActionMenuProps) => (
	<DropdownMenu {...props} />
);

export type PromptInputActionMenuTriggerProps = PromptInputButtonProps;

export const PromptInputActionMenuTrigger = ({
	children,
	...props
}: PromptInputActionMenuTriggerProps) => (
	<DropdownMenuTrigger asChild>
		<PromptInputButton accessibilityLabel="Open actions menu" {...props}>
			{children ?? <Icon as={PlusIcon} className="size-4" />}
		</PromptInputButton>
	</DropdownMenuTrigger>
);

export type PromptInputActionMenuContentProps = React.ComponentProps<
	typeof DropdownMenuContent
>;

export const PromptInputActionMenuContent = (
	props: PromptInputActionMenuContentProps,
) => <DropdownMenuContent align="start" {...props} />;

export type PromptInputActionMenuItemProps = React.ComponentProps<
	typeof DropdownMenuItem
>;

export const PromptInputActionMenuItem = (
	props: PromptInputActionMenuItemProps,
) => <DropdownMenuItem {...props} />;

export type PromptInputActionAddAttachmentsProps =
	PromptInputActionMenuItemProps & {
		label?: string;
		source?: "photos" | "files";
	};

export const PromptInputActionAddAttachments = ({
	label = "Add photos or files",
	source = "photos",
	onPress,
	...props
}: PromptInputActionAddAttachmentsProps) => {
	const attachments = usePromptInputAttachments();

	const handlePress = useCallback<NonNullable<typeof onPress>>(
		(event) => {
			onPress?.(event);
			if (source === "files") {
				void attachments.openFilePicker();
				return;
			}
			void attachments.openImagePicker();
		},
		[attachments, onPress, source],
	);

	return (
		<DropdownMenuItem {...props} onPress={handlePress}>
			<Icon
				as={source === "files" ? PaperclipIcon : ImageIcon}
				className="size-4"
			/>
			<Text>{label}</Text>
		</DropdownMenuItem>
	);
};

export type PromptInputSubmitProps = ButtonProps & {
	status?: ChatStatus;
	onStop?: () => void;
};

export const PromptInputSubmit = ({
	className,
	variant = "default",
	size = "icon",
	status = "ready",
	onStop,
	onPress,
	disabled,
	children,
	...props
}: PromptInputSubmitProps) => {
	const { canSubmit, submit } = usePromptInputForm();
	const isGenerating = status === "submitted" || status === "streaming";

	let icon = <Icon as={ArrowUpIcon} className="size-4" />;
	if (status === "submitted") {
		icon = <Spinner size="small" />;
	} else if (status === "streaming") {
		icon = <Icon as={SquareIcon} className="size-4" />;
	} else if (status === "error") {
		icon = <Icon as={RotateCcwIcon} className="size-4" />;
	}

	const handlePress = useCallback<NonNullable<typeof onPress>>(
		(event) => {
			onPress?.(event);
			if (isGenerating) {
				onStop?.();
				return;
			}
			submit();
		},
		[isGenerating, onPress, onStop, submit],
	);

	const isDisabled = disabled ?? (status === "ready" && !canSubmit);

	return (
		<Button
			accessibilityLabel={isGenerating ? "Stop" : "Submit"}
			className={cn("size-9 rounded-full", className)}
			disabled={isDisabled}
			onPress={handlePress}
			size={size}
			variant={variant}
			{...props}
		>
			{children ?? icon}
		</Button>
	);
};

export type PromptInputSelectProps = React.ComponentProps<typeof Select>;

export const PromptInputSelect = (props: PromptInputSelectProps) => (
	<Select {...props} />
);

export type PromptInputSelectTriggerProps = React.ComponentProps<
	typeof SelectTrigger
>;

export const PromptInputSelectTrigger = ({
	className,
	...props
}: PromptInputSelectTriggerProps) => (
	<SelectTrigger
		className={cn(
			"h-9 border-0 bg-transparent shadow-none dark:bg-transparent",
			className,
		)}
		size="sm"
		{...props}
	/>
);

export type PromptInputSelectContentProps = React.ComponentProps<
	typeof SelectContent
>;

export const PromptInputSelectContent = (
	props: PromptInputSelectContentProps,
) => <SelectContent {...props} />;

export type PromptInputSelectItemProps = React.ComponentProps<
	typeof SelectItem
>;

export const PromptInputSelectItem = (props: PromptInputSelectItemProps) => (
	<SelectItem {...props} />
);

export type PromptInputSelectValueProps = React.ComponentProps<
	typeof SelectValue
>;

export const PromptInputSelectValue = ({
	className,
	...props
}: PromptInputSelectValueProps) => (
	<SelectValue
		className={cn("font-medium text-muted-foreground text-sm", className)}
		{...props}
	/>
);
