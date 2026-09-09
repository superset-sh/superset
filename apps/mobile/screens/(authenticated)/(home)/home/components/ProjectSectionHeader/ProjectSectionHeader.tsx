import { useLingui } from "@lingui/react/macro";
import { ChevronDown, ChevronRight, Plus } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";

interface ProjectSectionHeaderProps {
	name: string;
	iconUrl?: string | null;
	/** Replaces the project avatar for sections that aren't a project. */
	icon?: ReactNode;
	count: number;
	collapsed: boolean;
	onToggle: () => void;
	/** Absent for sections you can't create into (e.g. "No project"). */
	onNewWorkspace?: () => void;
}

/**
 * Reads as the parent of the rows under it through the type scale alone —
 * `large` against their 15px — rather than through caps and letterspacing,
 * which shout at a list you're meant to scan. The count is what keeps a
 * collapsed section informative.
 */
export function ProjectSectionHeader({
	name,
	iconUrl,
	icon,
	count,
	collapsed,
	onToggle,
	onNewWorkspace,
}: ProjectSectionHeaderProps) {
	const { t } = useLingui();
	const theme = useTheme();
	const Caret = collapsed ? ChevronRight : ChevronDown;
	return (
		// The collapse target and the "+" are siblings on purpose: a control
		// nested inside an accessible Pressable is folded into its parent and
		// VoiceOver never reaches it.
		<View className="flex-row items-center px-4 pb-1 pt-4">
			<Pressable
				onPress={onToggle}
				accessibilityLabel={`${name}, ${count} ${count === 1 ? "workspace" : "workspaces"}`}
				accessibilityState={{ expanded: !collapsed }}
				className="flex-1 flex-row items-center gap-2.5 active:opacity-60"
			>
				{/* Two icons rather than one rotated: a transform on the icon itself
				    doesn't reach the underlying SVG, so it renders nothing. */}
				<Caret size={14} color={theme.mutedForeground} strokeWidth={2.5} />
				<View className="size-6 items-center justify-center">
					{icon ?? <ProjectAvatar name={name} iconUrl={iconUrl} size={20} />}
				</View>
				<Text variant="large" className="shrink" numberOfLines={1}>
					{name}
				</Text>
				<Text className="text-muted-foreground font-mono text-[13px]">
					{count}
				</Text>
			</Pressable>
			{onNewWorkspace ? (
				<Button
					accessibilityLabel={t({
						message: `New workspace in ${name}`,
					})}
					ph-label="project-header-new-workspace"
					variant="ghost"
					size="icon"
					className="size-6"
					hitSlop={8}
					onPress={onNewWorkspace}
				>
					<Icon as={Plus} className="text-muted-foreground size-5" />
				</Button>
			) : null}
		</View>
	);
}
