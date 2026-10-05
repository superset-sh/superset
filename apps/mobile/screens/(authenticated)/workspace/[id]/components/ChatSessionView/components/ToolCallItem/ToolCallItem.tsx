import type { ToolCall, ToolKind } from "@superset/chat/protocol";
import {
	ArrowRightLeft,
	Brain,
	FilePen,
	FileText,
	Globe,
	type LucideIcon,
	Search,
	SquareTerminal,
	Trash2,
	Wrench,
} from "lucide-react-native";
import { View } from "react-native";
import { ToolCallRow } from "@/components/ai-elements/tool-call-row";
import { Text } from "@/components/ui/text";

const ICON_BY_KIND: Record<ToolKind, LucideIcon> = {
	read: FileText,
	edit: FilePen,
	delete: Trash2,
	move: ArrowRightLeft,
	search: Search,
	execute: SquareTerminal,
	think: Brain,
	fetch: Globe,
	other: Wrench,
};

const PREVIEW_LINES = 40;

function preview(text: string): string {
	const lines = text.split("\n");
	return lines.length > PREVIEW_LINES
		? `${lines.slice(0, PREVIEW_LINES).join("\n")}\n…`
		: text;
}

export function ToolCallItem({ item }: { item: ToolCall }) {
	const details = item.content.map((content, index) => {
		const key = `${content.type}:${index}`;
		if (content.type === "terminal") {
			return (
				<Text className="font-mono text-muted-foreground text-xs" key={key}>
					{`$ ${content.command}\n${preview(content.output)}`}
				</Text>
			);
		}
		if (content.type === "diff") {
			return (
				<Text className="font-mono text-muted-foreground text-xs" key={key}>
					{`${content.path}\n${preview(content.newText)}`}
				</Text>
			);
		}
		return (
			<Text className="font-mono text-muted-foreground text-xs" key={key}>
				{preview(content.text)}
			</Text>
		);
	});

	return (
		<ToolCallRow
			icon={ICON_BY_KIND[item.toolKind] ?? Wrench}
			isError={item.status === "failed"}
			isPending={item.status === "running"}
			title={
				<Text
					className="min-w-0 shrink font-mono text-foreground text-xs"
					numberOfLines={1}
				>
					{item.title || item.toolName}
				</Text>
			}
		>
			{details.length > 0 ? (
				<View className="gap-2 py-1 pl-3">{details}</View>
			) : null}
		</ToolCallRow>
	);
}
