import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans, useLingui } from "@lingui/react/macro";
import { Stack, useRouter } from "expo-router";
import { Layers } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { posthog } from "@/lib/posthog";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
import { useCloudCreateSelection } from "@/screens/(authenticated)/(home)/hooks/useCloudCreateSelection";
import { GitlabEnvironmentProjects } from "./components/GitlabEnvironmentProjects";

/**
 * Picks which environment the next cloud workspace is created in — the image
 * or captured fork its sandbox starts from.
 */
export function EnvironmentPickerScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const setEnvironmentId = useNewSessionPreferencesStore(
		(state) => state.setEnvironmentId,
	);

	const { environmentsQuery, environments, environment } =
		useCloudCreateSelection();
	const currentEnvironments = useRef(environments);
	currentEnvironments.current =
		environmentsQuery.isError || environmentsQuery.isPending
			? []
			: environments;
	const selectedId = environment?.id ?? null;
	const { data: session } = useSession();
	const org = session?.session?.activeOrganizationId ?? null;
	const key = JSON.stringify([org, selectedId]);
	const latest = useRef<string | null>(key);
	latest.current = key;
	const live = useRef(true);
	useEffect(() => {
		live.current = true;
		latest.current = key;
		return () => {
			live.current = false;
			latest.current = null;
		};
	}, [key]);
	const selectNative = (id: string) => {
		if (environmentsQuery.isError || !live.current || key !== latest.current)
			return;
		setEnvironmentId(id);
		router.back();
	};

	let notice: string | null = null;
	let retry: (() => void) | null = null;
	if (environments.length === 0) {
		if (environmentsQuery.isError) {
			notice = t({
				message: "Could not load environments",
			});
			retry = () => void environmentsQuery.refetch();
		} else if (!environmentsQuery.isPending) {
			notice = t({
				message: "No environments available",
			});
		}
	}

	if (
		environmentsQuery.isError &&
		environments.some((row) => row.gitlabProject)
	) {
		notice = t({ message: "Could not load environments" });
		retry = () => {
			if (live.current && key === latest.current)
				void environmentsQuery.refetch();
		};
	}

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
			{environmentsQuery.isPending ? (
				<View className="items-center py-8">
					<Spinner />
				</View>
			) : null}
			{notice ? (
				<View className="items-center gap-3 py-6">
					<Text
						className="text-center text-sm"
						style={{ color: theme.mutedForeground }}
					>
						{notice}
					</Text>
					{retry ? (
						<Button size="sm" variant="secondary" onPress={retry}>
							<Text>
								<Trans>Try again</Trans>
							</Text>
						</Button>
					) : null}
				</View>
			) : null}
			{environments.map((environment) => (
				<Pressable
					key={environment.id}
					disabled={Boolean(
						environment.gitlabProject && environmentsQuery.isError,
					)}
					accessibilityState={{
						disabled: Boolean(
							environment.gitlabProject && environmentsQuery.isError,
						),
					}}
					onPress={() => {
						if (
							environment.gitlabProject &&
							(environmentsQuery.isError ||
								!live.current ||
								key !== latest.current ||
								!currentEnvironments.current.some(
									(row) =>
										row.id === environment.id &&
										row.organizationId === org &&
										JSON.stringify(row.gitlabProject) ===
											JSON.stringify(environment.gitlabProject),
								))
						)
							return;
						setEnvironmentId(environment.id);
						posthog.capture("new_session_environment_selected", {
							environment_id: environment.id,
						});
						router.back();
					}}
					className="flex-row items-center gap-2.5 py-2.5"
					ph-label="new-session-environment-row"
				>
					<Layers size={18} color={theme.mutedForeground} />
					<Text
						className="flex-1 text-sm font-medium"
						style={{ color: theme.foreground }}
					>
						{environment.name}
					</Text>
					{environment.gitlabProject ? (
						<Text className="max-w-[45%] shrink text-xs text-muted-foreground">
							{environment.gitlabProject.pathWithNamespace}
						</Text>
					) : null}
					{environment.id === selectedId ? (
						<Ionicons name="checkmark-circle" size={18} color={theme.primary} />
					) : null}
				</Pressable>
			))}
			<GitlabEnvironmentProjects onSelect={selectNative} />
		</ScrollView>
	);
}
