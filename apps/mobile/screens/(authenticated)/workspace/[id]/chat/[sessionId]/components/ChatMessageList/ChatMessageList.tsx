import { useRef } from "react";
import {
	ActivityIndicator,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	ScrollView,
	View,
} from "react-native";
import { MessageResponse } from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Text } from "@/components/ui/text";
import type { ChatMessage } from "../../hooks/useChatThread";
import { ToolPartView } from "./components/ToolPartView";

type Part = ChatMessage["content"][number];
type Rec = Record<string, unknown>;

/**
 * The snapshot carries raw mastracode `HarnessMessage` content, not AI-SDK
 * UIMessage parts. Tool calls are `{ type: "tool_call", id, name, args }` and
 * their output arrives as a SEPARATE `{ type: "tool_result", id, name, result,
 * isError }` part paired by `id`. `thinking` parts hold text under `.thinking`.
 * We flatten `content` into renderable items here (mirroring desktop's
 * AssistantMessage), pairing each call with its result and dropping the
 * standalone result parts that a call already consumed.
 */
type RenderPart =
	| { kind: "text"; text: string }
	| { kind: "reasoning"; text: string }
	| {
			kind: "tool";
			call: { name: string; args: unknown; id?: string };
			result?: { result: unknown; isError?: boolean };
	  }
	| { kind: "attachment"; label: string };

function str(v: unknown): string | undefined {
	return typeof v === "string" ? v : undefined;
}

function buildRenderParts(content: Part[]): RenderPart[] {
	const resultsById = new Map<string, { result: unknown; isError?: boolean }>();
	const callIds = new Set<string>();
	for (const p of content) {
		const rec = p as Rec;
		const id = str(rec.id);
		if (rec.type === "tool_result" && id) {
			resultsById.set(id, {
				result: rec.result,
				isError: Boolean(rec.isError),
			});
		} else if (rec.type === "tool_call" && id) {
			callIds.add(id);
		}
	}

	const out: RenderPart[] = [];
	for (const p of content) {
		const rec = p as Rec;
		const type = str(rec.type) ?? "";
		if (type === "text") {
			const text = str(rec.text) ?? "";
			if (text) out.push({ kind: "text", text });
		} else if (type === "thinking" || type === "reasoning") {
			const text = str(rec.thinking) ?? str(rec.text) ?? "";
			if (text) out.push({ kind: "reasoning", text });
		} else if (type === "tool_call") {
			const id = str(rec.id);
			out.push({
				kind: "tool",
				call: { name: str(rec.name) ?? "tool", args: rec.args, id },
				result: id ? resultsById.get(id) : undefined,
			});
		} else if (type === "tool_result") {
			// Skip results a tool_call already rendered; render true orphans alone.
			const id = str(rec.id);
			if (!id || !callIds.has(id)) {
				out.push({
					kind: "tool",
					call: { name: str(rec.name) ?? "tool", args: undefined, id },
					result: { result: rec.result, isError: Boolean(rec.isError) },
				});
			}
		} else if (type === "image" || type === "file") {
			out.push({ kind: "attachment", label: type });
		}
		// om_* observational-memory and unknown parts are intentionally dropped.
	}
	return out;
}

function RenderPartView({
	part,
	isUser,
	isStreaming,
}: {
	part: RenderPart;
	isUser: boolean;
	isStreaming: boolean;
}) {
	switch (part.kind) {
		case "text":
			if (isUser) {
				return (
					<Text className="text-foreground text-[15px] leading-5">
						{part.text}
					</Text>
				);
			}
			return <MessageResponse>{part.text}</MessageResponse>;
		case "reasoning":
			return (
				<Reasoning className="mb-0 mt-1">
					<ReasoningTrigger />
					<ReasoningContent>{part.text}</ReasoningContent>
				</Reasoning>
			);
		case "tool":
			return (
				<ToolPartView
					call={part.call}
					isStreaming={isStreaming}
					result={part.result}
				/>
			);
		case "attachment":
			return (
				<View className="bg-muted/60 border-border mt-1 rounded-md border px-2 py-1">
					<Text className="text-muted-foreground text-xs">
						📎 {part.label === "image" ? "image" : "file"}
					</Text>
				</View>
			);
	}
}

function MessageBubble({
	from,
	content,
	streaming,
	isStreaming = false,
}: {
	from: string;
	content: Part[];
	streaming?: boolean;
	isStreaming?: boolean;
}) {
	const isUser = from === "user";
	const parts = buildRenderParts(content);
	// User messages sit in a bordered bubble; agent messages are borderless
	// full-width (markdown prose), like Claude Code / ChatGPT.
	return (
		<View className={isUser ? "items-end" : "items-stretch"}>
			<View
				className={
					isUser
						? "border-border max-w-[85%] rounded-2xl rounded-br-md border px-3 py-2"
						: "px-0.5 py-1"
				}
			>
				<View className="gap-1">
					{parts.map((part, i) => (
						<RenderPartView
							isStreaming={isStreaming}
							isUser={isUser}
							key={`${part.kind}-${i}`}
							part={part}
						/>
					))}
					{streaming ? (
						<View className="mt-1 flex-row items-center gap-2">
							<ActivityIndicator size="small" />
							<Text className="text-muted-foreground text-xs">thinking…</Text>
						</View>
					) : null}
				</View>
			</View>
		</View>
	);
}

export function ChatMessageList({
	messages,
	currentMessage,
	isRunning,
	topInset = 0,
}: {
	messages: ChatMessage[];
	currentMessage: ChatMessage | null;
	isRunning: boolean;
	/** Extra top padding so the first message clears the transparent glass
	 * header while the list still scrolls under it. */
	topInset?: number;
}) {
	const scrollRef = useRef<ScrollView>(null);
	// Stick-to-bottom: only auto-scroll on content growth when the user is
	// already near the bottom. Otherwise expanding a collapsible tool/task card
	// (which grows content height) would yank them down to the latest message.
	const atBottomRef = useRef(true);

	const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
		const distanceFromBottom =
			contentSize.height - (contentOffset.y + layoutMeasurement.height);
		atBottomRef.current = distanceFromBottom < 80;
	};

	const showStreaming =
		isRunning && currentMessage && currentMessage.role === "assistant";
	const streamingHasContent =
		showStreaming && (currentMessage?.content?.length ?? 0) > 0;

	return (
		<ScrollView
			ref={scrollRef}
			className="flex-1"
			contentContainerClassName="px-4 pb-4 gap-3"
			contentContainerStyle={{ paddingTop: topInset + 16 }}
			onScroll={handleScroll}
			scrollEventThrottle={16}
			// Stick to the bottom for new turns / streaming tokens / optimistic
			// sends — but only when the user is already at the bottom, so expanding
			// a tool card up in the history doesn't jump them down.
			onContentSizeChange={() => {
				if (atBottomRef.current) {
					scrollRef.current?.scrollToEnd({ animated: true });
				}
			}}
		>
			{messages.map((message) => (
				<MessageBubble
					key={message.id}
					from={message.role}
					content={message.content as Part[]}
				/>
			))}
			{showStreaming ? (
				<MessageBubble
					from="assistant"
					content={(currentMessage?.content ?? []) as Part[]}
					isStreaming
					streaming={!streamingHasContent}
				/>
			) : null}
			{isRunning && !showStreaming ? (
				<View className="items-start">
					<View className="bg-card border-border flex-row items-center gap-2 rounded-2xl border px-3 py-2">
						<ActivityIndicator size="small" />
						<Text className="text-muted-foreground text-xs">working…</Text>
					</View>
				</View>
			) : null}
		</ScrollView>
	);
}
