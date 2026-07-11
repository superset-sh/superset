import type {
	MessageItem,
	TimelineContentBlock,
} from "@superset/session-protocol";
import { View } from "react-native";
import { MessageResponse } from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Text } from "@/components/ui/text";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function blockText(block: TimelineContentBlock): {
	kind: "text" | "thinking" | "other";
	text: string;
} {
	if (!isRecord(block)) return { kind: "other", text: "" };
	const record = block as unknown as Record<string, unknown>;
	if (record.type === "text" && typeof record.text === "string") {
		return { kind: "text", text: record.text };
	}
	if (record.type === "thinking" && typeof record.thinking === "string") {
		return { kind: "thinking", text: record.thinking };
	}
	if (record.type === "unknown" && "value" in record) {
		return { kind: "other", text: JSON.stringify(record.value) };
	}
	return { kind: "other", text: "" };
}

export function MessageItemView({ item }: { item: MessageItem }) {
	const blocks = item.blocks.map(blockText);
	const text = blocks
		.filter((block) => block.kind === "text")
		.map((block) => block.text)
		.join("");
	const thinking = blocks
		.filter((block) => block.kind === "thinking")
		.map((block) => block.text)
		.join("");

	if (!text.trim() && !thinking.trim()) return null;

	if (item.role === "user") {
		return (
			<View className="items-end">
				<View className="border-border max-w-[85%] rounded-2xl rounded-br-md border px-3 py-2">
					<Text className="text-foreground text-[15px] leading-5">{text}</Text>
				</View>
			</View>
		);
	}

	if (item.role === "system") {
		return text.trim() ? (
			<Text className="text-muted-foreground px-0.5 text-xs">{text}</Text>
		) : null;
	}

	return (
		<View className="gap-1 px-0.5 py-1">
			{thinking.trim() ? (
				<Reasoning className="mb-0 mt-1" isStreaming={item.partial}>
					<ReasoningTrigger />
					<ReasoningContent>{thinking}</ReasoningContent>
				</Reasoning>
			) : null}
			{text.trim() ? <MessageResponse>{text}</MessageResponse> : null}
		</View>
	);
}
