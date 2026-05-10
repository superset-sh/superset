import { Link } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export interface TaskCardProps {
	id: string;
	title: string;
	slug?: string;
	statusName?: string;
	statusColor?: string;
}

/**
 * Compact, scannable task row. Status dot uses the user-configured colour
 * straight from the task_statuses table — keeps brand consistency
 * (Aesthetic-Usability) without inventing new tokens.
 */
export function TaskCard({
	id,
	title,
	slug,
	statusName,
	statusColor,
}: TaskCardProps) {
	return (
		<Link href={`/(authenticated)/(tasks)/${id}`} asChild>
			<Pressable
				className="flex-row items-center gap-3 rounded-xl bg-card px-4 py-3 active:opacity-70"
				style={{ minHeight: 44 }}
			>
				{statusColor ? (
					<View
						className="size-2.5 rounded-full"
						style={{ backgroundColor: statusColor }}
						accessibilityLabel={statusName ?? "status"}
					/>
				) : null}
				<View className="flex-1 gap-0.5">
					<Text
						className="text-base font-medium text-foreground"
						numberOfLines={1}
					>
						{title}
					</Text>
					{slug || statusName ? (
						<Text className="text-xs text-muted-foreground" numberOfLines={1}>
							{[slug, statusName].filter(Boolean).join(" · ")}
						</Text>
					) : null}
				</View>
				<Icon as={ChevronRight} className="text-muted-foreground size-5" />
			</Pressable>
		</Link>
	);
}
