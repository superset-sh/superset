import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { useNewChatTargets } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useNewChatTargets";
import { useNewChatPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newChatPreferencesStore";

function BranchRow({
	name,
	isSelected,
	onPress,
}: {
	name: string;
	isSelected: boolean;
	onPress: () => void;
}) {
	const theme = useTheme();
	return (
		<Pressable className="flex-row items-center gap-2 py-2.5" onPress={onPress}>
			<Text
				className="flex-1 text-sm"
				numberOfLines={1}
				style={{ color: theme.foreground }}
			>
				{name}
			</Text>
			{isSelected ? (
				<Ionicons name="checkmark-circle" size={18} color={theme.primary} />
			) : null}
		</Pressable>
	);
}

export function BranchPickerScreen() {
	const router = useRouter();
	const theme = useTheme();
	const [query, setQuery] = useState("");
	const { targets, defaultTarget } = useNewChatTargets();
	const targetKey = useNewChatPreferencesStore((state) => state.targetKey);
	const baseBranch = useNewChatPreferencesStore((state) => state.baseBranch);
	const setBaseBranch = useNewChatPreferencesStore(
		(state) => state.setBaseBranch,
	);

	const selectedTarget =
		targets.find((target) => target.key === targetKey) ?? defaultTarget;
	const hostUrl = selectedTarget?.hostUrl ?? null;
	const projectId = selectedTarget?.projectId ?? null;

	const trimmedQuery = query.trim();
	const { data, isLoading } = useQuery({
		queryKey: ["host-service", "branches", hostUrl, projectId, trimmedQuery],
		enabled: hostUrl !== null && projectId !== null,
		placeholderData: (previous) => previous,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl || !projectId) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).workspaceCreation.searchBranches.query({
				projectId,
				query: trimmedQuery || undefined,
				limit: 50,
				refresh: trimmedQuery === "",
			});
		},
	});

	const defaultBranch = data?.defaultBranch ?? null;
	const branches = useMemo(
		() => (data?.items ?? []).filter((branch) => branch.name !== defaultBranch),
		[data, defaultBranch],
	);

	const selectAndClose = (branch: string | null) => {
		setBaseBranch(branch);
		router.back();
	};

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			{/* The formSheet's content wrapper special-cases its direct subviews:
			    it expects [header, ScrollView] and sizes the ScrollView to the
			    remainder (react-native-screens RNSScreenContentWrapper). Any
			    other shape gets the ScrollView pinned over the whole sheet. The
			    header needs collapsable={false} so RN view flattening doesn't
			    remove it from the native hierarchy. */}
			<View collapsable={false} className="bg-background px-6 pb-2 pt-3">
				<View className="relative justify-center">
					<View className="absolute left-3 z-10">
						<Ionicons name="search" size={16} color={theme.mutedForeground} />
					</View>
					<Input
						autoCapitalize="none"
						autoCorrect={false}
						className="rounded-full pl-9"
						onChangeText={setQuery}
						placeholder="Branches..."
						value={query}
					/>
				</View>
			</View>
			<ScrollView
				className="bg-background"
				contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 24 }}
				keyboardShouldPersistTaps="handled"
			>
				{defaultBranch ? (
					<>
						<Text
							className="pb-1 pt-3 text-sm font-semibold"
							style={{ color: theme.mutedForeground }}
						>
							Default
						</Text>
						<BranchRow
							name={defaultBranch}
							isSelected={baseBranch === null || baseBranch === defaultBranch}
							onPress={() => selectAndClose(null)}
						/>
					</>
				) : null}
				{branches.length > 0 ? (
					<Text
						className="pb-1 pt-3 text-sm font-semibold"
						style={{ color: theme.mutedForeground }}
					>
						{trimmedQuery ? "Branches" : "Recents"}
					</Text>
				) : null}
				{branches.map((branch) => (
					<BranchRow
						key={branch.name}
						name={branch.name}
						isSelected={baseBranch === branch.name}
						onPress={() => selectAndClose(branch.name)}
					/>
				))}
				{isLoading && !data ? (
					<View className="items-center py-6">
						<Spinner size="small" />
					</View>
				) : null}
				{!isLoading && !defaultBranch && branches.length === 0 ? (
					<Text
						className="py-6 text-center text-sm"
						style={{ color: theme.mutedForeground }}
					>
						No branches found
					</Text>
				) : null}
			</ScrollView>
		</>
	);
}
