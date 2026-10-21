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
	ComposerDraft,
	ComposerDraftSegment,
	ComposerMentionEntry,
	ComposerMentionProvider,
	ComposerMentionSource,
	ComposerPanelContent,
	ComposerPanelControls,
	PromptInputAttachment,
	PromptInputCommand,
	PromptInputDictation,
	PromptInputDictationError,
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
	toolbar,
	toolbarEnd,
	draft,
	onDraftChange,
	onSubmit,
	onStop,
	allowEmptySubmit = false,
	disabled = false,
	pending = false,
	autoFocus = false,
	onAttachmentClick,
	history,
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
					toolbar={toolbar}
					toolbarEnd={toolbarEnd}
					draft={draft}
					onDraftChange={onDraftChange}
					onSubmit={onSubmit}
					onStop={onStop}
					allowEmptySubmit={allowEmptySubmit}
					disabled={disabled}
					pending={pending}
					autoFocus={autoFocus}
					onAttachmentClick={onAttachmentClick}
					history={history}
				/>
			</LexicalRoot>
		</div>
	);
}
