import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";
import { useNewChatTargets } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useNewChatTargets";
import { useNewChatPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newChatPreferencesStore";

export function ProjectPickerScreen() {
	const router = useRouter();
	const theme = useTheme();
	const { targets, defaultTarget } = useNewChatTargets();
	const targetKey = useNewChatPreferencesStore((state) => state.targetKey);
	const setTargetKey = useNewChatPreferencesStore(
		(state) => state.setTargetKey,
	);

	const selectedKey =
		targets.find((target) => target.key === targetKey)?.key ??
		defaultTarget?.key ??
		null;

	return (
		<ScrollView
			className="bg-background flex-1 px-6"
			contentContainerStyle={{ flexGrow: 1, paddingVertical: 8 }}
		>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			{targets.length === 0 ? (
				<Text
					className="py-6 text-center text-sm"
					style={{ color: theme.mutedForeground }}
				>
					No projects on an online host
				</Text>
			) : null}
			{targets.map((target) => {
				const isSelected = target.key === selectedKey;
				return (
					<Pressable
						key={target.key}
						onPress={() => {
							setTargetKey(target.key);
							router.back();
						}}
						className="flex-row items-center gap-2.5 py-2.5"
					>
						<ProjectAvatar
							name={target.projectName}
							iconUrl={target.projectIconUrl}
							size={32}
						/>
						<Text
							className="flex-1 text-sm font-medium"
							style={{ color: theme.foreground }}
						>
							{target.projectName}
						</Text>
						{isSelected ? (
							<Ionicons
								name="checkmark-circle"
								size={18}
								color={theme.primary}
							/>
						) : null}
					</Pressable>
				);
			})}
		</ScrollView>
	);
}
