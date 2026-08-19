import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useRouter } from "expo-router";
import { Cloud } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";
import {
	type NewChatTarget,
	useNewChatTargets,
} from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";

/**
 * One sheet, sectioned by where the workspace would run: Cloud first — it is
 * never offline — then each online machine. A tap picks both the place and
 * the project.
 */
export function ProjectPickerScreen() {
	const router = useRouter();
	const theme = useTheme();
	const { targets, defaultTarget } = useNewChatTargets();
	const targetKey = useNewSessionPreferencesStore((state) => state.targetKey);
	const setTargetKey = useNewSessionPreferencesStore(
		(state) => state.setTargetKey,
	);

	const selectedKey =
		targets.find((target) => target.key === targetKey)?.key ??
		defaultTarget?.key ??
		null;

	const sections = useMemo(() => {
		const cloud = targets.filter((target) => target.kind === "cloud");
		const byHost = new Map<string, { name: string; rows: NewChatTarget[] }>();
		for (const target of targets) {
			if (target.kind !== "host") continue;
			const group = byHost.get(target.machineId);
			if (group) group.rows.push(target);
			else
				byHost.set(target.machineId, {
					name: target.hostName,
					rows: [target],
				});
		}
		return { cloud, hosts: [...byHost.values()] };
	}, [targets]);

	const select = (key: string) => {
		setTargetKey(key);
		router.back();
	};

	const renderRow = (target: NewChatTarget) => (
		<Pressable
			key={target.key}
			onPress={() => select(target.key)}
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
			{target.key === selectedKey ? (
				<Ionicons name="checkmark-circle" size={18} color={theme.primary} />
			) : null}
		</Pressable>
	);

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
					No projects available
				</Text>
			) : null}
			{sections.cloud.length > 0 ? (
				<>
					<View className="flex-row items-center gap-2 pb-1 pt-2">
						<Icon
							as={Cloud}
							className="text-muted-foreground size-4"
							strokeWidth={1.75}
						/>
						<Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
							Cloud
						</Text>
					</View>
					{sections.cloud.map(renderRow)}
				</>
			) : null}
			{sections.hosts.map((host, index) => (
				<View
					key={host.name + String(index)}
					className={
						sections.cloud.length > 0 || index > 0
							? "border-border/60 mt-3 border-t pt-3"
							: undefined
					}
				>
					<Text className="text-muted-foreground pb-1 text-xs font-semibold uppercase tracking-wide">
						{host.name}
					</Text>
					{host.rows.map(renderRow)}
				</View>
			))}
		</ScrollView>
	);
}
