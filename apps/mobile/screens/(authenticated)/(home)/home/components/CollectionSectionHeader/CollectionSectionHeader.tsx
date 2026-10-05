import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

interface CollectionSectionHeaderProps {
	name: string;
	color: string | null;
	projectCount: number;
	collapsed: boolean;
	onToggle: () => void;
}

/**
 * Same rhythm as a project header, with desktop's color dot in the avatar
 * slot so the names line up. The count only shows once the projects hide.
 */
export function CollectionSectionHeader(props: CollectionSectionHeaderProps) {
	const { name, color, collapsed, onToggle } = props;
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const theme = useTheme();
	const Caret = collapsed ? ChevronRight : ChevronDown;
	return (
		<Pressable
			onPress={onToggle}
			accessibilityRole="button"
			accessibilityLabel={`${name}, ${t({
				message: plural(props.projectCount, {
					one: "# project",
					other: "# projects",
				}),
			})}`}
			accessibilityState={{ expanded: !collapsed }}
			ph-label="collection-header"
			className="flex-row items-center gap-2.5 px-4 pb-1 pt-4 active:opacity-60"
		>
			<Caret size={14} color={theme.mutedForeground} strokeWidth={2.5} />
			<View className="size-6 items-center justify-center">
				<View
					className="size-2.5 rounded-full"
					style={{ backgroundColor: color ?? theme.mutedForeground }}
				/>
			</View>
			<Text variant="large" className="shrink" numberOfLines={1}>
				{name}
			</Text>
			{collapsed ? (
				<Text className="text-muted-foreground font-mono text-[13px]">
					{formatNumber(props.projectCount)}
				</Text>
			) : null}
		</Pressable>
	);
}
