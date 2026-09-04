import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans } from "@lingui/react/macro";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { posthog } from "@/lib/posthog";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";
import {
	type NewChatTarget,
	useNewChatTargets,
} from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";

/**
 * One flat list of the selected machine's projects. Where the workspace runs
 * is picked at the top of Home, never here — and under Cloud the composer
 * doesn't open this at all.
 */
export function ProjectPickerScreen() {
	const router = useRouter();
	const routeParams = useLocalSearchParams<{ selectedKey?: string }>();
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const { targets, defaultTarget } = useNewChatTargets();
	const targetKey = useNewSessionPreferencesStore((state) => state.targetKey);
	const setTargetKey = useNewSessionPreferencesStore(
		(state) => state.setTargetKey,
	);

	const selectedKey =
		routeParams.selectedKey ||
		(targets.find((target) => target.key === targetKey)?.key ??
			defaultTarget?.key ??
			null);

	const select = (key: string) => {
		const picked = targets.find((target) => target.key === key);
		setTargetKey(key);
		posthog.capture("new_session_project_selected", {
			project_id: picked?.projectId ?? null,
			target_kind: picked?.kind ?? null,
		});
		router.back();
	};

	const renderRow = (target: NewChatTarget) => (
		<Pressable
			key={target.key}
			onPress={() => select(target.key)}
			className="flex-row items-center gap-2.5 py-2.5"
			ph-label="new-session-project-row"
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
			{target.key === selectedKey ? (
				<Ionicons name="checkmark-circle" size={18} color={theme.primary} />
			) : null}
		</Pressable>
	);

	return (
		<ScrollView
			className="bg-background flex-1 px-6"
			contentContainerStyle={{
				flexGrow: 1,
				paddingTop: 8,
				paddingBottom: insets.bottom + 8,
			}}
		>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			{targets.length === 0 ? (
				<Text
					className="py-6 text-center text-sm"
					style={{ color: theme.mutedForeground }}
				>
					<Trans>No projects available</Trans>
				</Text>
			) : null}
			{targets.map(renderRow)}
		</ScrollView>
	);
}
