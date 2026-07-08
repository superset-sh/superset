import { NativeTabs } from "expo-router/unstable-native-tabs";
import { THEME } from "@/lib/theme";

export default function WorkspaceLayout() {
	return (
		<NativeTabs
			tintColor={THEME.dark.foreground}
			iconColor={THEME.dark.mutedForeground}
			blurEffect="systemThickMaterialDark"
			minimizeBehavior="never"
		>
			<NativeTabs.Trigger name="chat">
				<NativeTabs.Trigger.Icon
					sf={{
						default: "bubble.left.and.bubble.right",
						selected: "bubble.left.and.bubble.right.fill",
					}}
				/>
				<NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="changes">
				<NativeTabs.Trigger.Icon sf="plus.forwardslash.minus" />
				<NativeTabs.Trigger.Label>Changes</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
