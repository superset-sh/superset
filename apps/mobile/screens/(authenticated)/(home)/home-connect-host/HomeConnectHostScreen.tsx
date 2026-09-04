import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { MonitorSmartphone } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useOrgHostsQuery } from "@/hooks/useOrgHosts";
import { openUrl } from "@/lib/open-url";
import { posthog } from "@/lib/posthog";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { OrganizationHeaderButton } from "../home/components/OrganizationHeaderButton";
import { SetupStep } from "./components/SetupStep";

const SETUP_DOCS_URL = `${COMPANY.DOCS_URL}/remote-access`;

/**
 * Home for an organization with no device of yours in it. Every list on this
 * tab is served by a machine running Superset, and a machine only reaches the
 * relay once someone opts it in on a desktop — so with none connected the
 * normal home is an empty list above a composer that can't send anywhere,
 * which reads as a broken app rather than an unfinished setup.
 *
 * The steps are the setup itself, not a teaser for the docs: the work happens
 * on a computer this screen can't reach, so the phone's job is to say exactly
 * what to do there. The org name is in step 2 because signing the desktop into
 * a different organization is the failure that looks identical to this one.
 * The hosts query polls, so the screen gives way on its own once a device
 * lands.
 */
export function HomeConnectHostScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const { isLoadingOrganizations, activeOrganization } = useOrganizations();
	const hosts = useOrgHostsQuery();

	// Only a tap of Check again shows as checking: the hosts query polls on its
	// own, and borrowing its isFetching would blink the button every 30s.
	const [checking, setChecking] = useState(false);

	useEffect(() => {
		posthog.capture("host_setup_prompt_shown");
	}, []);

	return (
		<>
			<OrganizationHeaderButton
				isLoading={isLoadingOrganizations}
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					router.push("/(authenticated)/(home)/organizations");
				}}
			/>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="justify-center gap-6 px-6 py-8"
				contentContainerStyle={{ flexGrow: 1 }}
				contentInsetAdjustmentBehavior="automatic"
			>
				<View className="items-center gap-3">
					<View className="bg-muted size-14 items-center justify-center rounded-full">
						<Icon
							as={MonitorSmartphone}
							className="text-foreground size-7"
							strokeWidth={1.5}
						/>
					</View>
					<View className="items-center gap-2">
						<Text className="text-2xl font-semibold text-foreground">
							<Trans>Connect a device</Trans>
						</Text>
						<Text className="text-muted-foreground text-center text-base">
							<Trans>
								Superset Mobile runs agents on the computers you connect.
							</Trans>
						</Text>
					</View>
				</View>

				<View className="gap-4">
					<SetupStep
						step={1}
						title={t({
							message: "Install the desktop app",
						})}
					>
						<Trans>
							Download Superset at{" "}
							<Text className="text-foreground text-sm font-medium">
								{COMPANY.DOMAIN}/download
							</Text>
							.
						</Trans>
					</SetupStep>
					<SetupStep
						step={2}
						title={t({
							message: `Sign in to ${
								activeOrganization?.name ??
								t({
									message: "this organization",
								})
							}`,
						})}
					/>
					<SetupStep
						step={3}
						title={t({
							message: "Allow access through the relay",
						})}
					>
						<Trans>
							Settings → Remote Access → “Allow remote access to this device via
							relay”.
						</Trans>
					</SetupStep>
				</View>

				<View className="gap-2">
					<Button
						size="lg"
						disabled={checking}
						onPress={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							setChecking(true);
							void hosts.refetch().finally(() => setChecking(false));
						}}
					>
						<Text>
							{checking
								? t({ message: "Checking…" })
								: t({
										message: "Check again",
									})}
						</Text>
					</Button>
					<Button
						size="lg"
						variant="outline"
						onPress={() => openUrl(SETUP_DOCS_URL)}
					>
						<Text>
							<Trans>Read the setup guide</Trans>
						</Text>
					</Button>
				</View>
			</ScrollView>
		</>
	);
}
