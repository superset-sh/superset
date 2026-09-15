import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans, useLingui } from "@lingui/react/macro";
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { posthog } from "@/lib/posthog";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
import { useCloudCreateSelection } from "@/screens/(authenticated)/(home)/hooks/useCloudCreateSelection";

/**
 * Picks the repository a cloud workspace checks out, for an environment that
 * fixes none of its own.
 */
export function RepositoryPickerScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const [query, setQuery] = useState("");
	const setRepositoryId = useNewSessionPreferencesStore(
		(state) => state.setRepositoryId,
	);
	const { repositoriesQuery, repository } = useCloudCreateSelection();

	const trimmedQuery = query.trim().toLowerCase();
	const repositories = useMemo(
		() =>
			(repositoriesQuery.data ?? []).filter((row) =>
				row.fullName.toLowerCase().includes(trimmedQuery),
			),
		[repositoriesQuery.data, trimmedQuery],
	);

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			{/* The formSheet sizes a [header, ScrollView] pair; see BranchPickerScreen. */}
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
						placeholder={t({ message: "Search repositories..." })}
						value={query}
					/>
				</View>
			</View>
			<ScrollView
				className="bg-background"
				contentContainerStyle={{
					paddingBottom: insets.bottom + 8,
					paddingHorizontal: 24,
				}}
				keyboardShouldPersistTaps="handled"
			>
				{repositories.map((row) => (
					<Pressable
						key={row.id}
						className="flex-row items-center gap-2.5 py-2.5"
						onPress={() => {
							setRepositoryId(row.id);
							posthog.capture("new_session_repository_selected", {
								repository_id: row.id,
							});
							router.back();
						}}
						ph-label="new-session-repository-row"
					>
						<Ionicons
							name="logo-github"
							size={18}
							color={theme.mutedForeground}
						/>
						<Text
							className="flex-1 text-sm"
							numberOfLines={1}
							style={{ color: theme.foreground }}
						>
							{row.fullName}
						</Text>
						{row.id === repository?.id ? (
							<Ionicons
								name="checkmark-circle"
								size={18}
								color={theme.primary}
							/>
						) : null}
					</Pressable>
				))}
				{repositoriesQuery.isPending ? (
					<View className="items-center py-6">
						<Spinner size="small" />
					</View>
				) : repositoriesQuery.isError ? (
					<View className="items-center gap-3 py-6">
						<Text
							className="text-center text-sm"
							style={{ color: theme.mutedForeground }}
						>
							<Trans>Failed to load repositories. Please try again.</Trans>
						</Text>
						<Button
							size="sm"
							variant="secondary"
							onPress={() => void repositoriesQuery.refetch()}
						>
							<Text>
								<Trans>Try again</Trans>
							</Text>
						</Button>
					</View>
				) : repositories.length === 0 ? (
					<Text
						className="py-6 text-center text-sm"
						style={{ color: theme.mutedForeground }}
					>
						{trimmedQuery ? (
							<Trans>No repositories found</Trans>
						) : (
							<Trans>No repositories connected.</Trans>
						)}
					</Text>
				) : null}
			</ScrollView>
		</>
	);
}
