import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { Info, RotateCcw } from "lucide-react-native";
import { Alert, Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import { PingDot } from "@/screens/(authenticated)/components/PingDot";
import { WaveSpinner } from "@/screens/(authenticated)/components/WaveSpinner";
import { compactTime } from "@/screens/(authenticated)/workspace/[id]/utils/compactTime";

/** Desktop's CloudWorkspaceStatus, with Unarchive in reach instead of on hover. */
export function CloudWorkspaceStatus({
	row,
	isUnread,
	now,
}: {
	row: CloudWorkspaceRow;
	isUnread: boolean;
	now: Date;
}) {
	const { t } = useLingui();
	const theme = useTheme();
	const { unarchive } = useCloudWorkspaceActions();

	if (row.status === "provisioning") {
		return (
			<View accessibilityLabel={t({ message: "Creating the sandbox" })}>
				<WaveSpinner color={theme.mutedForeground} />
			</View>
		);
	}
	if (row.status === "archived") {
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t({ message: "Unarchive workspace" })}
				hitSlop={8}
				className="size-8 items-center justify-center rounded-md active:opacity-60"
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					void unarchive(row.id).catch(() =>
						Alert.alert(t({ message: "Unarchive failed" })),
					);
				}}
				ph-label="cloud-row-unarchive"
			>
				<Icon as={RotateCcw} className="text-muted-foreground size-4" />
			</Pressable>
		);
	}
	if (row.status === "failed" || row.agentStatus === "failed") {
		return (
			<Icon
				as={Info}
				accessibilityLabel={
					row.status === "failed"
						? t({ message: "Sandbox stopped responding" })
						: t({ message: "Agent run failed" })
				}
				className="size-3.5 text-red-400"
			/>
		);
	}
	if (row.agentStatus === "permission") {
		return (
			<View accessibilityLabel={t({ message: "Waiting for your input" })}>
				<PingDot color="#eab308" size={6} />
			</View>
		);
	}
	if (row.agentStatus === "working") {
		return (
			<View accessibilityLabel={t({ message: "Agent is working" })}>
				<WaveSpinner color="#f59e0b" />
			</View>
		);
	}
	if (isUnread) {
		return (
			<View
				accessibilityLabel={t({ message: "Agent finished" })}
				className="size-1.5 rounded-full bg-green-500"
			/>
		);
	}
	if (!row.agentStatusAt) return null;
	return (
		<Text className="text-muted-foreground text-[11px] tabular-nums">
			{compactTime(row.agentStatusAt.getTime(), now.getTime())}
		</Text>
	);
}
