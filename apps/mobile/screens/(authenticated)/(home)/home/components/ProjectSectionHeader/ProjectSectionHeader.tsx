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
		<Pressable
			onPress={onToggle}
			accessibilityLabel={`${name}, ${count} ${count === 1 ? "workspace" : "workspaces"}`}
			accessibilityState={{ expanded: !collapsed }}
			className="flex-row items-center gap-2.5 px-4 pb-1 pt-4 active:opacity-60"
		>
			{/* Two icons rather than one rotated: a transform on the icon itself
			    doesn't reach the underlying SVG, so it renders nothing. */}
			<Caret size={14} color={theme.mutedForeground} strokeWidth={2.5} />
			<View className="size-6 items-center justify-center">
				{icon ?? <ProjectAvatar name={name} iconUrl={iconUrl} size={20} />}
			</View>
			<Text variant="large" numberOfLines={1}>
				{name}
			</Text>
			<Text className="text-muted-foreground font-mono text-[13px]">
				{count}
			</Text>
			{onNewWorkspace ? (
				<>
					<View className="flex-1" />
					<Button
						accessibilityLabel={t({
							id: "mobile.home.newWorkspaceIn",
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
				</>
			) : null}
		</Pressable>
	);
}
