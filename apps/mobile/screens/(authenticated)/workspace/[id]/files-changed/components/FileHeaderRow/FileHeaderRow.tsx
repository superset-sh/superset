import {
	Host,
	Button as SwiftUIButton,
	Image as SwiftUIImage,
	Menu as SwiftUIMenu,
} from "@expo/ui/swift-ui";
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
import { FILE_HEADER_HEIGHT } from "../../utils/diffMetrics";

export function FileHeaderRow({
	file,
	expanded,
	viewed,
	onToggle,
	onCopyPath,
	onViewFile,
	onAddComment,
	onDelete,
	onToggleViewed,
}: {
	file: ChangesetFile;
	expanded: boolean;
	viewed: boolean;
	onToggle: (path: string) => void;
	onCopyPath: (file: ChangesetFile) => void;
	onViewFile: (file: ChangesetFile) => void;
	onAddComment: (file: ChangesetFile) => void;
	onDelete: (file: ChangesetFile) => void;
	onToggleViewed: (path: string) => void;
}) {
	return (
		<PressableScale
			className="bg-background border-border/60 flex-row items-center gap-3 border-t border-b px-4"
			style={{ height: FILE_HEADER_HEIGHT }}
			onPress={() => onToggle(file.path)}
		>
			<Icon
				as={expanded ? ChevronDown : ChevronRight}
				className="text-muted-foreground size-[18px]"
			/>
			<Text
				className="text-foreground/80 min-w-0 flex-1 font-mono text-[13px]"
				numberOfLines={1}
			>
				{file.path}
			</Text>
			<View className="bg-border h-5 w-px" />
			<Host style={{ width: 32, height: 32 }}>
				<SwiftUIMenu
					label={
						<SwiftUIImage systemName="ellipsis" color="#9ca3af" size={16} />
					}
				>
					<SwiftUIButton
						label="Copy relative path"
						systemImage="doc.on.doc"
						onPress={() => onCopyPath(file)}
					/>
					<SwiftUIButton
						label="View file"
						systemImage="doc.text"
						onPress={() => onViewFile(file)}
					/>
					<SwiftUIButton
						label="Add file comment"
						systemImage="text.bubble"
						onPress={() => onAddComment(file)}
					/>
					{/* biome-ignore lint/a11y/useValidAriaRole: SwiftUI button role, not ARIA */}
					<SwiftUIButton
						label="Delete file"
						systemImage="trash"
						role="destructive"
						onPress={() => onDelete(file)}
					/>
				</SwiftUIMenu>
			</Host>
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
						"size-[22px]",
						viewed ? "text-green-500" : "text-muted-foreground/60",
					)}
					strokeWidth={1.5}
				/>
			</PressableScale>
		</PressableScale>
	);
}
