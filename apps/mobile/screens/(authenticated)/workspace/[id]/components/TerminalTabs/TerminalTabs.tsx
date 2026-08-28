import { useLingui } from "@lingui/react/macro";
import { List, Plus } from "lucide-react-native";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { AgentMark } from "@/screens/(authenticated)/(home)/new-session/agent";
import { PingDot } from "@/screens/(authenticated)/components/PingDot";

interface TerminalTabsProps {
	rows: TerminalRowData[];
	activeTerminalId: string | null;
	onSelect: (terminalId: string) => void;
	onAdd: () => void;
	onManage: () => void;
	onClose: (terminalId: string) => void;
}

/**
 * The workspace's sessions as iOS-style pill chips (Safari tab bar, not
 * browser tabs): agent mark + name, active chip filled, closing via
 * long-press. The trailing buttons open the sessions sheet (reorder, close)
 * and the new-session sheet.
 */
export function TerminalTabs({
	rows,
	activeTerminalId,
	onSelect,
	onAdd,
	onManage,
	onClose,
}: TerminalTabsProps) {
	const { t } = useLingui();
	const theme = useTheme();
	return (
		<View className="flex-row items-center gap-2 px-3 pb-2.5 pt-1.5">
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerClassName="gap-1.5 items-center"
				className="flex-1"
			>
				{rows.map((row) => {
					const active = row.terminalId === activeTerminalId;
					return (
						<Pressable
							key={row.terminalId}
							ph-label="terminal-tab"
							onPress={() => onSelect(row.terminalId)}
							onLongPress={() =>
								Alert.alert(
									t({
										id: "mobile.terminalTabs.closeSession",
										message: "Close session",
									}),
									row.title,
									[
										{
											text: t({ id: "common.cancel", message: "Cancel" }),
											style: "cancel",
										},
										{
											text: t({ id: "mobile.common.close", message: "Close" }),
											style: "destructive",
											onPress: () => onClose(row.terminalId),
										},
									],
								)
							}
							className={cn(
								"flex-row items-center gap-1.5 rounded-md px-3 py-1.5",
								active ? "bg-secondary" : "bg-secondary/40",
							)}
						>
							<AgentMark
								agentId={row.agentId ?? ""}
								size={13}
								color={theme.mutedForeground}
							/>
							<Text
								className={cn(
									"max-w-36 text-xs font-medium",
									active ? "text-foreground" : "text-muted-foreground",
								)}
								numberOfLines={1}
							>
								{row.title}
							</Text>
							{/* Desktop StatusIndicator colors: yellow permission ping,
							    amber working ping, red failed ping, green static review. */}
							{row.attention === "permission" ? (
								<PingDot color="#eab308" size={6} />
							) : row.attention === "failed" ? (
								<PingDot color="#ef4444" size={6} />
							) : row.attention === "working" ? (
								<PingDot color="#f59e0b" size={6} />
							) : row.attention === "review" ? (
								<View className="bg-green-500 size-1.5 rounded-full" />
							) : null}
						</Pressable>
					);
				})}
			</ScrollView>
			<Pressable
				onPress={onManage}
				accessibilityLabel={t({
					id: "mobile.terminalTabs.manageSessions",
					message: "Manage sessions",
				})}
				ph-label="terminal-tabs-manage"
				className="bg-secondary/40 size-7 items-center justify-center rounded-md active:opacity-60"
			>
				<List size={15} color={theme.foreground} strokeWidth={2.25} />
			</Pressable>
			<Pressable
				onPress={onAdd}
				accessibilityLabel={t({
					id: "mobile.nav.newSession.title",
					message: "New session",
				})}
				ph-label="terminal-tabs-add"
				className="bg-secondary/40 size-7 items-center justify-center rounded-md active:opacity-60"
			>
				<Plus size={15} color={theme.foreground} strokeWidth={2.25} />
			</Pressable>
		</View>
	);
}
