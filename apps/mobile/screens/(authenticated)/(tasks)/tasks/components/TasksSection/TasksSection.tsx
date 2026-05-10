import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { TaskCard, type TaskCardProps } from "../TaskCard";

const VISIBLE_LIMIT = 7; // Miller's Law.

export interface TasksSectionProps {
	title: string;
	items: TaskCardProps[];
	defaultCollapsed?: boolean;
}

export function TasksSection({
	title,
	items,
	defaultCollapsed = false,
}: TasksSectionProps) {
	const [collapsed, setCollapsed] = useState(defaultCollapsed);
	const [expanded, setExpanded] = useState(false);

	const visible = expanded ? items : items.slice(0, VISIBLE_LIMIT);
	const hasMore = items.length > VISIBLE_LIMIT;

	return (
		<View className="gap-2">
			<Pressable
				onPress={() => setCollapsed((c) => !c)}
				className="flex-row items-center justify-between px-2"
				style={{ minHeight: 44 }}
				accessibilityRole="button"
				accessibilityLabel={`${title}, ${items.length} tasks`}
			>
				<Text className="text-xs font-medium text-muted-foreground uppercase">
					{title}
				</Text>
				<Text className="text-xs text-muted-foreground">
					{collapsed ? `Show ${items.length}` : items.length}
				</Text>
			</Pressable>
			{collapsed ? null : (
				<View className="gap-1.5">
					{visible.map((item) => (
						<TaskCard key={item.id} {...item} />
					))}
					{hasMore && !expanded ? (
						<Pressable
							onPress={() => setExpanded(true)}
							className="items-center justify-center rounded-xl py-3 active:opacity-70"
							style={{ minHeight: 44 }}
						>
							<Text className="text-sm font-medium text-muted-foreground">
								Show all {items.length}
							</Text>
						</Pressable>
					) : null}
				</View>
			)}
		</View>
	);
}
