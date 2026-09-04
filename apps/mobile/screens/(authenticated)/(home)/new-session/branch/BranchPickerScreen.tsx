import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useOrgHostsQuery } from "@/hooks/useOrgHosts";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { posthog } from "@/lib/posthog";
import { apiClient } from "@/lib/trpc/client";
import { CLOUD_TARGET_ID } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";

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
		<Pressable
			className="flex-row items-center gap-2 py-2.5"
			onPress={onPress}
			ph-label="new-session-branch-row"
		>
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
	const { t } = useLingui();
	const router = useRouter();
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const [query, setQuery] = useState("");
	const params = useLocalSearchParams<{
		projectId?: string;
		machineId?: string;
	}>();
	const baseBranch = useNewSessionPreferencesStore((state) => state.baseBranch);
	const setBaseBranch = useNewSessionPreferencesStore(
		(state) => state.setBaseBranch,
	);

	const isCloud = params.machineId === CLOUD_TARGET_ID;
	const hostsQuery = useOrgHostsQuery();
	const host =
		!isCloud && params.machineId
			? (hostsQuery.data?.find(
					(entry) => entry.machineId === params.machineId,
				) ?? null)
			: null;
	const hostUrl = host
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;
	const projectId = params.projectId || null;
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const trimmedQuery = query.trim();
	const { data, isLoading } = useQuery({
		queryKey: [
			isCloud ? "cloud-branches" : "host-service",
			"branches",
			hostUrl,
			projectId,
			trimmedQuery,
		],
		enabled: projectId !== null && (isCloud ? !!organizationId : !!hostUrl),
		placeholderData: (previous) => previous,
		networkMode: "always" as const,
		queryFn: async (): Promise<{
			defaultBranch: string | null;
			items: Array<{ name: string }>;
		} | null> => {
			if (!projectId) return null;
			// A cloud target has no host holding a checkout; branches come from
			// the GitHub remote through the API's App installation instead.
			if (isCloud) {
				if (!organizationId) return null;
				return apiClient.cloudWorkspace.listBranches.query({
					organizationId,
					query: trimmedQuery || undefined,
				});
			}
			if (!hostUrl) return null;
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

	const resolvingHost = !isCloud && !host && hostsQuery.isPending;
	const defaultBranch = data?.defaultBranch ?? null;
	const branches = useMemo(
		() => (data?.items ?? []).filter((branch) => branch.name !== defaultBranch),
		[data, defaultBranch],
	);

	const selectAndClose = (branch: string | null) => {
		setBaseBranch(branch);
		posthog.capture("new_session_branch_selected", {
			is_default_branch: branch === null || branch === defaultBranch,
		});
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
						placeholder={t({
							message: "Branches...",
						})}
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
				{defaultBranch ? (
					<>
						<Text
							className="pb-1 pt-3 text-sm font-semibold"
							style={{ color: theme.mutedForeground }}
						>
							<Trans>Default</Trans>
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
						{trimmedQuery
							? t({ message: "Branches" })
							: t({ message: "Recents" })}
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
				{(isLoading || resolvingHost) && !data ? (
					<View className="items-center py-6">
						<Spinner size="small" />
					</View>
				) : null}
				{!isLoading &&
				!resolvingHost &&
				!defaultBranch &&
				branches.length === 0 ? (
					<Text
						className="py-6 text-center text-sm"
						style={{ color: theme.mutedForeground }}
					>
						<Trans>No branches found</Trans>
					</Text>
				) : null}
			</ScrollView>
		</>
	);
}
