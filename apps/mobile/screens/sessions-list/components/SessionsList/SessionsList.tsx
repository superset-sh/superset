import { Plus } from "lucide-react-native";
import type { ReactNode } from "react";
import {
	FlatList,
	type FlatListProps,
	type ListRenderItemInfo,
	ScrollView,
	View,
	type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppliedFilterTag } from "@/components/AppliedFilterTag";
import { FabBase } from "@/components/FabBase";
import {
	ProjectChipHeader,
	type ProjectChipHeaderProps,
} from "@/components/ProjectChipHeader";
import { SessionRow } from "@/components/SessionRow";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { ChatSession } from "../../types";

export type SessionsListAppliedFilter = {
	id: string;
	kind: "workspace" | "status";
	label: string;
};

export type SessionsListProps = ViewProps & {
	projectName: string;
	headerProps?: Omit<ProjectChipHeaderProps, "projectName" | "belowSearch">;
	sessions: ReadonlyArray<ChatSession>;
	appliedFilters?: ReadonlyArray<SessionsListAppliedFilter>;
	onClearFilters?: () => void;
	onFilterDismiss?: (id: string) => void;
	onSessionPress?: (session: ChatSession) => void;
	onSessionLongPress?: (session: ChatSession) => void;
	onNewChatPress?: () => void;
	/** Hide the FAB (e.g., during empty-no-workspaces). Default true. */
	showFab?: boolean;
	/** Empty body slot — replaces FlatList when sessions length is 0. */
	emptyBody?: ReactNode;
	flatListProps?: Omit<
		FlatListProps<ChatSession>,
		"data" | "renderItem" | "keyExtractor"
	>;
};

/**
 * Sessions-list organism (UC-NAV §A). Composes:
 *  - ProjectChipHeader (two-row sticky header) with optional AppliedFilterTag
 *    row injected via the `belowSearch` slot
 *  - FlatList<SessionRow> separated by hairlines
 *  - FabBase (NewChatFab) anchored bottom-right above the tab bar safe-area
 *
 * No expo-router / no useTheme — storybook-safe.
 */
export function SessionsList({
	projectName,
	headerProps,
	sessions,
	appliedFilters,
	onClearFilters,
	onFilterDismiss,
	onSessionPress,
	onSessionLongPress,
	onNewChatPress,
	showFab = true,
	emptyBody,
	flatListProps,
	className,
	...props
}: SessionsListProps) {
	const insets = useSafeAreaInsets();
	const hasFilters = (appliedFilters?.length ?? 0) > 0;

	const renderItem = ({ item }: ListRenderItemInfo<ChatSession>) => (
		<SessionRow
			title={item.title}
			branch={item.branch}
			hostName={item.hostName}
			hostKind={item.hostKind}
			status={item.status}
			statusLabel={item.statusLabel}
			timeLabel={item.timeLabel}
			unread={item.unread}
			onPress={() => onSessionPress?.(item)}
			onLongPress={() => onSessionLongPress?.(item)}
		/>
	);

	return (
		<View className={cn("flex-1 bg-background", className)} {...props}>
			<ProjectChipHeader
				projectName={projectName}
				{...headerProps}
				belowSearch={
					hasFilters ? (
						<View className="border-t border-border">
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={{ gap: 8, padding: 12 }}
							>
								{appliedFilters?.map((f) => (
									<AppliedFilterTag
										key={f.id}
										kind={f.kind}
										label={f.label}
										onDismiss={() => onFilterDismiss?.(f.id)}
									/>
								))}
								{onClearFilters ? (
									<AppliedFilterTag
										kind="status"
										label="Clear"
										onPress={onClearFilters}
										onDismiss={onClearFilters}
										dismissAccessibilityLabel="Clear all filters"
									/>
								) : null}
							</ScrollView>
						</View>
					) : null
				}
			/>
			{sessions.length === 0 && emptyBody ? (
				emptyBody
			) : (
				<FlatList<ChatSession>
					data={sessions as ChatSession[]}
					renderItem={renderItem}
					keyExtractor={(s) => s.id}
					ItemSeparatorComponent={Separator}
					ListEmptyComponent={
						<View className="flex-1 items-center justify-center p-8">
							<Text variant="muted">No sessions</Text>
						</View>
					}
					{...flatListProps}
				/>
			)}
			{showFab ? (
				<View
					pointerEvents="box-none"
					style={{
						position: "absolute",
						right: 16,
						bottom: Math.max(insets.bottom, 16) + 16,
					}}
				>
					<FabBase
						icon={Plus}
						accessibilityLabel="New chat"
						variant="accent"
						size="md"
						onPress={onNewChatPress}
					/>
				</View>
			) : null}
		</View>
	);
}
