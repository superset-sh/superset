import * as Haptics from "expo-haptics";
import {
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Circle,
} from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import type { ChangesetFile } from "../../../hooks/useWorkspaceChangeset";

function splitPath(path: string): { name: string; dir: string | null } {
	const separator = path.lastIndexOf("/");
	if (separator === -1) return { name: path, dir: null };
	return { name: path.slice(separator + 1), dir: path.slice(0, separator) };
}

export function FileHeaderRow({
	file,
	expanded,
	viewed,
	onToggle,
	onMenu,
	onToggleViewed,
}: {
	file: ChangesetFile;
	expanded: boolean;
	viewed: boolean;
	onToggle: (path: string) => void;
	onMenu: (file: ChangesetFile) => void;
	onToggleViewed: (path: string) => void;
}) {
	const { name, dir } = splitPath(file.path);
	return (
		<PressableScale
			className="bg-background border-border/60 flex-row items-center gap-2.5 border-t px-4 py-3"
			onPress={() => onToggle(file.path)}
			onLongPress={() => onMenu(file)}
		>
			<Icon
				as={expanded ? ChevronDown : ChevronRight}
				className="text-muted-foreground size-4"
			/>
			<Text className="font-semibold text-[15px]" numberOfLines={1}>
				{name}
			</Text>
			{dir ? (
				<Text
					className="text-muted-foreground min-w-0 flex-1 text-[13px]"
					numberOfLines={1}
				>
					{dir}
				</Text>
			) : (
				<View className="flex-1" />
			)}
			<View className="flex-row items-center gap-1">
				<Text className="text-green-500 font-medium text-[13px]">
					+{file.additions}
				</Text>
				<Text className="text-red-500 font-medium text-[13px]">
					−{file.deletions}
				</Text>
			</View>
			<PressableScale
				accessibilityLabel="File actions"
				hitSlop={8}
				onPress={() => onMenu(file)}
			>
				<Text className="text-muted-foreground px-1 font-semibold text-[15px]">
					···
				</Text>
			</PressableScale>
			<PressableScale
				accessibilityLabel={viewed ? "Mark as not viewed" : "Mark as viewed"}
				hitSlop={8}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					onToggleViewed(file.path);
				}}
			>
				<Icon
					as={viewed ? CheckCircle2 : Circle}
					className={cn(
						"size-5",
						viewed ? "text-green-500" : "text-muted-foreground/50",
					)}
					strokeWidth={1.75}
				/>
			</PressableScale>
		</PressableScale>
	);
}
