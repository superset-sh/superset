import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { WorkspaceCard, type WorkspaceCardProps } from "../WorkspaceCard";

const VISIBLE_LIMIT = 7; // Miller's Law — chunk to ≤7 per viewport.

export interface ProjectSectionProps {
	title: string;
	count?: number;
	items: WorkspaceCardProps[];
	defaultCollapsed?: boolean;
}

/**
 * Section header + chunked list of workspace cards.
 * - Caps at 7 visible (Miller's Law) with a "Show all" reveal.
 * - `defaultCollapsed` lets us hide low-priority sections (Tesler's Law).
 */
export function ProjectSection({
	title,
	count,
	items,
	defaultCollapsed = false,
}: ProjectSectionProps) {
	const [collapsed, setCollapsed] = useState(defaultCollapsed);
	const [expanded, setExpanded] = useState(false);

	const total = count ?? items.length;
	const visible = expanded ? items : items.slice(0, VISIBLE_LIMIT);
	const hasMore = items.length > VISIBLE_LIMIT;

	return (
		<View className="gap-2">
			<Pressable
				onPress={() => setCollapsed((c) => !c)}
				className="flex-row items-center justify-between px-2"
				style={{ minHeight: 44 }}
				accessibilityRole="button"
				accessibilityLabel={`${title}, ${total} items, ${collapsed ? "collapsed" : "expanded"}`}
			>
				<Text className="text-xs font-medium text-muted-foreground uppercase">
					{title}
				</Text>
				<Text className="text-xs text-muted-foreground">
					{collapsed ? `Show ${total}` : total}
				</Text>
			</Pressable>
			{collapsed ? null : (
				<View className="gap-1.5">
					{visible.map((item) => (
						<WorkspaceCard key={item.id} {...item} />
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
