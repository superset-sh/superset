import {
	Host,
	Button as SwiftUIButton,
	Image as SwiftUIImage,
	Menu as SwiftUIMenu,
} from "@expo/ui/swift-ui";
import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { Check, ChevronDown, ChevronRight, Circle } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import type { ChangesetFile } from "../../../hooks/useWorkspaceChangeset";
import { FILE_HEADER_HEIGHT } from "../../utils/diffMetrics";

export const FileHeaderRow = memo(function FileHeaderRow({
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
	const { t } = useLingui();
	const theme = useTheme();
	return (
		<View
			className="bg-background border-border/60 flex-row items-center gap-3 border-t border-b px-4"
			style={{ height: FILE_HEADER_HEIGHT }}
		>
			<PressableScale
				className="min-w-0 flex-1 flex-row items-center gap-3 self-stretch"
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
			</PressableScale>
			<View className="bg-border h-5 w-px" />
			<Host style={{ width: 32, height: 32 }}>
				<SwiftUIMenu
					label={
						<SwiftUIImage
							systemName="ellipsis"
							color={theme.mutedForeground}
							size={16}
						/>
					}
				>
					<SwiftUIButton
						label={t({
							message: "Copy relative path",
						})}
						systemImage="doc.on.doc"
						onPress={() => onCopyPath(file)}
					/>
					<SwiftUIButton
						label={t({
							message: "View file",
						})}
						systemImage="doc.text"
						onPress={() => onViewFile(file)}
					/>
					<SwiftUIButton
						label={t({
							message: "Add file comment",
						})}
						systemImage="text.bubble"
						onPress={() => onAddComment(file)}
					/>
					{/* biome-ignore lint/a11y/useValidAriaRole: SwiftUI button role, not ARIA */}
					<SwiftUIButton
						label={t({
							message: "Delete file",
						})}
						systemImage="trash"
						role="destructive"
						onPress={() => onDelete(file)}
					/>
				</SwiftUIMenu>
			</Host>
			<PressableScale
				accessibilityLabel={
					viewed
						? t({
								message: "Mark as not viewed",
							})
						: t({
								message: "Mark as viewed",
							})
				}
				hitSlop={8}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					onToggleViewed(file.path);
				}}
			>
				{viewed ? (
					// Filled disc with the check knocked out. Filling CheckCircle2
					// instead paints the tick in the same green as the disc it sits on.
					<View className="bg-green-500 size-[22px] items-center justify-center rounded-full">
						<Icon
							as={Check}
							className="text-background size-[14px]"
							strokeWidth={3}
						/>
					</View>
				) : (
					<Icon
						as={Circle}
						className="text-muted-foreground/60 size-[22px]"
						strokeWidth={1.5}
					/>
				)}
			</PressableScale>
		</View>
	);
});
