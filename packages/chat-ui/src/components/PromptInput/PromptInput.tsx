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
	PromptInputHandle,
	PromptInputProps,
	PromptInputSubmitPayload,
} from "./types";

export function PromptInput({
	ref,
	placeholder = i18n._(
		msg({
			message: "Do anything",
		}),
	),
	mentionProviders,
	commands,
	dictation,
	status = "ready",
	submitWhileStreaming = false,
	placement = "top",
	toolbar,
	toolbarEnd,
	defaultValue,
	onChange,
	onSubmit,
	onStop,
	header,
	onAddFiles,
	allowEmptySubmit = false,
	clearOnSubmit = true,
	hideSubmit = false,
	autoFocus = false,
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
					ref={ref}
					placeholder={placeholder}
					mentionProviders={mentionProviders}
					commands={commands}
					dictation={dictation}
					status={status}
					submitWhileStreaming={submitWhileStreaming}
					placement={placement}
					toolbar={toolbar}
					toolbarEnd={toolbarEnd}
					defaultValue={defaultValue}
					onChange={onChange}
					onSubmit={onSubmit}
					onStop={onStop}
					header={header}
					onAddFiles={onAddFiles}
					allowEmptySubmit={allowEmptySubmit}
					clearOnSubmit={clearOnSubmit}
					hideSubmit={hideSubmit}
					autoFocus={autoFocus}
					onMentionHighlight={onMentionHighlight}
					onAttachmentClick={onAttachmentClick}
					onChipClick={onChipClick}
				/>
			</LexicalRoot>
		</div>
	);
}
