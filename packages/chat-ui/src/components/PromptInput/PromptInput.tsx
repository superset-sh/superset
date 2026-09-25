"use client";

import {
	type InitialConfigType,
	LexicalComposer as LexicalRoot,
} from "@lexical/react/LexicalComposer";
import { i18n } from "@superset/i18n";
import { useState } from "react";
import { ComposerBody } from "./components/ComposerBody";
import { MentionChipNode } from "./nodes/mentionChipNode";
import type { PromptInputProps } from "./types";
import "./prompt-input.css";
import { msg } from "@lingui/core/macro";

export type {
	ComposerActionContext,
	ComposerChip,
	ComposerMentionEntry,
	ComposerMentionProvider,
	ComposerMentionSource,
	ComposerPanelContent,
	PromptInputAttachment,
	PromptInputCommand,
	PromptInputDictation,
	PromptInputProps,
	PromptInputSubmitPayload,
} from "./types";

export function PromptInput({
	placeholder = i18n._(
		msg({
			message: "Do anything",
		}),
	),
	mentionProviders,
	commands,
	dictation,
	status = "ready",
	placement = "top",
	toolbar,
	onSubmit,
	onStop,
	onMentionHighlight,
	onAttachmentClick,
	onChipClick,
	className,
}: PromptInputProps) {
	const [initialConfig] = useState<InitialConfigType>(() => ({
		namespace: "prompt-input",
		nodes: [MentionChipNode],
		onError: (error: Error) => {
			throw error;
		},
	}));

	return (
		<div className={className}>
			<LexicalRoot initialConfig={initialConfig}>
				<ComposerBody
					placeholder={placeholder}
					mentionProviders={mentionProviders}
					commands={commands}
					dictation={dictation}
					status={status}
					placement={placement}
					toolbar={toolbar}
					onSubmit={onSubmit}
					onStop={onStop}
					onMentionHighlight={onMentionHighlight}
					onAttachmentClick={onAttachmentClick}
					onChipClick={onChipClick}
				/>
			</LexicalRoot>
		</div>
	);
}
