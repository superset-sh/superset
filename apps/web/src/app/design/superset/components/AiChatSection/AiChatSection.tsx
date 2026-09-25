"use client";

import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@superset/ui/ai-elements/reasoning";
import { Suggestion, Suggestions } from "@superset/ui/ai-elements/suggestion";
import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

const REASONING_TEXT = `The user wants the tooltip to show only the shortcut.

1. Find the tooltip call sites.
2. Drop the label, keep the \`HotkeyLabel\` keycaps.
3. Verify the Kbd styling stays visible on the chip background.`;

export function AiChatSection() {
	return (
		<ShowcaseSection
			id="ai-chat"
			index="03"
			title={i18n._(
				msg({
					message: "AI · Conversation",
				}),
			)}
			description={i18n._(
				msg({
					message: "Chat surfaces: messages, reasoning, suggestions",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(
					msg({
						message: "Conversation · Message",
					}),
				)}
				importPath="@superset/ui/ai-elements/conversation"
				description={i18n._(
					msg({
						message:
							"Also: @superset/ui/ai-elements/message — sticks to bottom as content streams",
					}),
				)}
				span
				bleed
			>
				<Conversation className="relative h-64 w-full">
					<ConversationContent className="mx-auto max-w-2xl">
						<Message from="user">
							<MessageContent>
								<Trans>Can you standardize the tooltips across the app?</Trans>
							</MessageContent>
						</Message>
						<Message from="assistant">
							<MessageContent>
								<Trans>
									Done — the bordered chip style used by the presets bar is now
									the default for every tooltip, and the copy-pasted overrides
									are removed (net −90 lines).
								</Trans>
							</MessageContent>
						</Message>
						<Message from="user">
							<MessageContent>
								<Trans>Nice, open a PR when ready.</Trans>
							</MessageContent>
						</Message>
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Reasoning",
					}),
				)}
				importPath="@superset/ui/ai-elements/reasoning"
				description={i18n._(
					msg({
						message: "Collapsible thinking block with duration label",
					}),
				)}
			>
				<Reasoning
					className="w-full"
					defaultOpen
					duration={4}
					isStreaming={false}
				>
					<ReasoningTrigger />
					<ReasoningContent>{REASONING_TEXT}</ReasoningContent>
				</Reasoning>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Suggestions",
					}),
				)}
				importPath="@superset/ui/ai-elements/suggestion"
			>
				<Suggestions className="w-full">
					<Suggestion suggestion="Fix the failing tests" />
					<Suggestion suggestion="Summarize this diff" />
					<Suggestion suggestion="Write a PR description" />
					<Suggestion suggestion="Refactor to shared helper" />
				</Suggestions>
			</ComponentCard>
		</ShowcaseSection>
	);
}
