import {
	ChevronDown,
	Menu,
	Package,
	Search,
	Settings,
	X,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "@/components/IconButton";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ProjectChipHeaderVariant = "multi-project" | "single-project";

export type ProjectChipHeaderProps = ViewProps & {
	projectName: string;
	variant?: ProjectChipHeaderVariant;
	searchValue?: string;
	searchPlaceholder?: string;
	onSearchChange?: (value: string) => void;
	onClearSearch?: () => void;
	/** Active filter count — when ≥1, renders the badge on the filter button. */
	filterCount?: number;
	onMenuPress?: () => void;
	onProjectChipPress?: () => void;
	onFilterPress?: () => void;
	/** Slot rendered below the search row (e.g. AppliedFilterTag row). */
	belowSearch?: ReactNode;
};

/**
 * Sessions-list two-row sticky header (UC-NAV §A). Composes:
 *  - Row 1: hamburger IconButton + ProjectChip (Pill with package icon + name + ▾)
 *  - Row 2: search TextInput (with leading Search + trailing X) + filter IconButton (with `·N` badge)
 *  - Optional belowSearch slot for AppliedFilterTag row
 *
 * Variants:
 *  - `multi-project` — chip is tappable, chevron visible, `accessibilityRole="button"`
 *  - `single-project` — chip is static (no chevron, pointer-events disabled)
 *
 * `filterCount` controls the badge: 0 hides, ≥1 shows `·N`.
 *
 * NativeWind / NO expo-router imports.
 */
export function ProjectChipHeader({
	projectName,
	variant = "multi-project",
	searchValue,
	searchPlaceholder,
	onSearchChange,
	onClearSearch,
	filterCount = 0,
	onMenuPress,
	onProjectChipPress,
	onFilterPress,
	belowSearch,
	className,
	...props
}: ProjectChipHeaderProps) {
	const insets = useSafeAreaInsets();
	const isMultiProject = variant === "multi-project";
	const showClear = (searchValue?.length ?? 0) > 0;
	const showBadge = filterCount > 0;
	const resolvedPlaceholder =
		searchPlaceholder ?? `Search ${projectName} sessions`;

	return (
		<View
			accessibilityRole="header"
			className={cn("bg-background border-b border-border", className)}
			style={{ paddingTop: insets.top }}
			{...props}
		>
			{/* Row 1: menu + project chip */}
			<View className="flex-row items-center gap-2 px-3 py-2">
				<IconButton
					icon={Menu}
					accessibilityLabel="Open navigation drawer"
					variant="ghost"
					size="md"
					onPress={onMenuPress}
				/>
				<Pressable
					accessibilityRole={isMultiProject ? "button" : undefined}
					accessibilityLabel={
						isMultiProject
							? `Switch project — currently: ${projectName}`
							: `Current project: ${projectName}`
					}
					accessibilityState={isMultiProject ? { expanded: false } : undefined}
					disabled={!isMultiProject}
					onPress={isMultiProject ? onProjectChipPress : undefined}
					className={cn(
						"flex-row items-center gap-1.5 px-3 py-1.5 rounded-full",
						isMultiProject && "bg-secondary",
					)}
				>
					<Icon as={Package} className="text-muted-foreground size-4" />
					<Text className="text-foreground font-medium">{projectName}</Text>
					{isMultiProject ? (
						<Icon as={ChevronDown} className="text-muted-foreground size-3" />
					) : null}
				</Pressable>
			</View>

			{/* Row 2: search + filter */}
			<View className="flex-row items-center gap-2 px-3 pb-2">
				<View className="flex-1 flex-row items-center bg-secondary rounded-md px-2 min-h-touch-min">
					<Icon as={Search} className="text-muted-foreground size-4 mr-1.5" />
					<Input
						value={searchValue}
						onChangeText={onSearchChange}
						placeholder={resolvedPlaceholder}
						accessibilityLabel="Search sessions"
						className="flex-1 border-0 bg-transparent px-0"
					/>
					{showClear ? (
						<IconButton
							icon={X}
							accessibilityLabel="Clear search"
							variant="ghost"
							size="xs"
							onPress={onClearSearch}
						/>
					) : null}
				</View>
				<View>
					<IconButton
						icon={Settings}
						accessibilityLabel={
							showBadge
								? `Filter sessions — ${filterCount} active`
								: "Filter sessions"
						}
						variant="ghost"
						size="md"
						onPress={onFilterPress}
					/>
					{showBadge ? (
						<View pointerEvents="none" className="absolute -top-0.5 -right-0.5">
							<Badge variant="default" className="h-4 px-1 min-w-4">
								<Text className="text-[10px] font-mono leading-3">
									·{filterCount}
								</Text>
							</Badge>
						</View>
					) : null}
				</View>
			</View>

			{/* Optional applied-filter-tag row */}
			{belowSearch}
		</View>
	);
}
