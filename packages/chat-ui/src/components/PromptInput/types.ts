import type { ReactNode } from "react";

export type ComposerChip = {
	label: string;
	serialized: string;
	brandColor?: string;
	// Icon as a URL string so chips stay serializable data.
	iconUrl?: string;
	data?: unknown;
};

export type ComposerActionContext = {
	insertChip(chip: ComposerChip): void;
	attachFiles(): void;
	openPanel(panel: ComposerPanelContent): void;
	query: string;
};

export type ComposerPanelContent = {
	title: string;
	render: () => ReactNode;
};

export type ComposerMentionEntry = {
	id: string;
	label: string;
	description?: string;
	icon?: ReactNode;
	keywords?: string[];
	// When set, selecting rewrites the query to this value and keeps the menu
	// open (directory drilling); select() is not called.
	completionQuery?: string;
	select(ctx: ComposerActionContext): void | Promise<void>;
};

export type ComposerMentionSource =
	| {
			kind: "static";
			load(
				signal: AbortSignal,
			): ComposerMentionEntry[] | Promise<ComposerMentionEntry[]>;
	  }
	| {
			kind: "search";
			search(
				query: string,
				signal: AbortSignal,
			): Promise<ComposerMentionEntry[]>;
			emptyState: string;
			loadingState?: string;
	  };

export type ComposerMentionProvider = {
	id: string;
	title: string;
	priority: number;
	source: ComposerMentionSource;
};

export type PromptInputCommand = {
	id: string;
	title: string;
	description?: string;
	icon?: ReactNode;
	rightIcon?: ReactNode;
	group?: string;
	searchAliases?: string[];
	onSelect(ctx: ComposerActionContext): void | Promise<void>;
};

export type PromptInputAttachment = {
	id: string;
	file: File;
	// Object URL for image attachments; owned and revoked by the composer.
	previewUrl?: string;
};

export type PromptInputSubmitPayload = {
	text: string;
	files: File[];
	mentions: ComposerChip[];
};

export type PromptInputDictationError = {
	message: string;
	canRetry: boolean;
};

export type PromptInputDictation = {
	transcribe(audio: Blob): Promise<string> | string;
	// Surfaced for app-owned toasts; retryable failures also keep the
	// recording and show retry controls in the composer row.
	onError?(error: PromptInputDictationError): void;
};

export type PromptInputProps = {
	placeholder?: string;
	mentionProviders: ComposerMentionProvider[];
	commands: PromptInputCommand[];
	status?: "ready" | "streaming";
	placement?: "top" | "bottom";
	// Enables the mic button; the app owns speech-to-text.
	dictation?: PromptInputDictation;
	toolbar?: ReactNode;
	onSubmit?: (payload: PromptInputSubmitPayload) => void;
	onStop?: () => void;
	onMentionHighlight?: (entry: ComposerMentionEntry | null) => void;
	onAttachmentClick?: (attachment: PromptInputAttachment) => void;
	onChipClick?: (chip: ComposerChip) => void;
	className?: string;
};
