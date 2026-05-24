import { Package } from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type SessionsListEmptyNoProjectsProps = {
	className?: string;
};

/**
 * UC-NAV-06.1 — no projects yet. The header reduces to a plain centered
 * "Sessions" title because chip/search/filter are meaningless without a
 * project. No FAB because a workspace is required to start a chat.
 */
export function SessionsListEmptyNoProjects({
	className,
}: SessionsListEmptyNoProjectsProps) {
	const insets = useSafeAreaInsets();
	return (
		<View className={cn("flex-1 bg-background", className)}>
			<View
				className="border-b border-border items-center py-4"
				style={{ paddingTop: insets.top + 8 }}
			>
				<Text className="text-foreground text-lg font-semibold">Sessions</Text>
			</View>
			<EmptyState
				icon={Package}
				heading="No projects yet"
				body="Create a project on desktop to get started. Projects group your workspaces and let you scope sessions to one team or codebase at a time."
			/>
		</View>
	);
}
