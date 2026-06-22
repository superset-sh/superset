import type { LucideIcon } from "lucide-react-native";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ToolCall } from "./tool-call";

export type ExploringGroupItem = {
	icon: LucideIcon;
	title: string;
	subtitle?: string;
	isPending: boolean;
	isError: boolean;
	onClick?: () => void;
};

export type ExploringGroupProps = {
	items: ExploringGroupItem[];
	isStreaming: boolean;
	className?: string;
};

const MAX_VISIBLE_TOOLS = 5;

function buildSummary(items: ExploringGroupItem[]): string {
	let files = 0;
	let searches = 0;
	for (const item of items) {
		if (/read|glob|explor|found.*file/i.test(item.title)) {
			files++;
		} else {
			searches++;
		}
	}
	const parts: string[] = [];
	if (files > 0) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
	if (searches > 0)
		parts.push(`${searches} ${searches === 1 ? "search" : "searches"}`);
	return parts.join(" ");
}

export const ExploringGroup = ({
	items,
	isStreaming,
	className,
}: ExploringGroupProps) => {
	const [isExpanded, setIsExpanded] = useState(isStreaming);
	const wasStreamingRef = useRef(isStreaming);

	// Auto-collapse when streaming ends (transition from true -> false)
	useEffect(() => {
		if (wasStreamingRef.current && !isStreaming) {
			setIsExpanded(false);
		}
		wasStreamingRef.current = isStreaming;
	}, [isStreaming]);

	const summary = buildSummary(items);

	// While streaming, pin to the most recent items (the web version auto-scrolls
	// a fixed-height container instead; nested vertical scrolling is avoided here).
	const visibleItems =
		isStreaming && items.length > MAX_VISIBLE_TOOLS
			? items.slice(-MAX_VISIBLE_TOOLS)
			: items;
	const hiddenCount = items.length - visibleItems.length;

	return (
		<View className={className}>
			<Pressable
				accessibilityRole="button"
				className="flex-row items-center gap-1.5 py-0.5"
				onPress={() => setIsExpanded((prev) => !prev)}
			>
				<Text className="shrink-0 font-medium text-muted-foreground text-xs">
					{isStreaming ? "Exploring" : "Explored"}
				</Text>
				<Text className="shrink-0 text-muted-foreground/60 text-xs">
					{summary}
				</Text>
				<Icon
					as={isExpanded ? ChevronDownIcon : ChevronRightIcon}
					className="size-3.5 text-muted-foreground/60"
				/>
			</Pressable>

			{isExpanded ? (
				<View className="mt-1 gap-1.5">
					{hiddenCount > 0 ? (
						<Text className="text-muted-foreground/60 text-xs">
							+{hiddenCount} earlier
						</Text>
					) : null}
					{visibleItems.map((item, i) => (
						<ToolCall
							icon={item.icon}
							isError={item.isError}
							isPending={item.isPending}
							key={`${item.title}-${i}`}
							onClick={item.onClick}
							subtitle={item.subtitle}
							title={item.title}
						/>
					))}
				</View>
			) : null}
		</View>
	);
};
