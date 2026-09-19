import { Trans, useLingui } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { useRouter } from "expo-router";
import { CloudOff, Moon, Power, ToggleLeft } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { HintRow } from "./components/HintRow";
import { HostPresenceUnknownView } from "./components/HostPresenceUnknownView";
import { HostSetupPendingView } from "./components/HostSetupPendingView";
import { useRefreshHostsPresence } from "./hooks/useRefreshHostsPresence";
import { getLastSeenTime } from "./utils/getLastSeenTime";

export function HostOfflineView({
	hostName,
	lastSeenAt,
}: {
	hostName: string;
	lastSeenAt: number | null | undefined;
}) {
	const { t } = useLingui();
	const router = useRouter();
	const { hosts } = useOrgHosts();
	const refreshPresence = useRefreshHostsPresence();
	const [checking, setChecking] = useState(false);

	if (lastSeenAt === null) {
		return <HostSetupPendingView hostName={hostName} />;
	}
	if (lastSeenAt === undefined) {
		return <HostPresenceUnknownView hostName={hostName} />;
	}

	const now = Date.now();
	const lastSeen = formatRelativeTime(getLastSeenTime(lastSeenAt, now), now);

	return (
		<View className="flex-1 items-center justify-center gap-6 px-8">
			<View className="bg-muted size-14 items-center justify-center rounded-full">
				<Icon
					as={CloudOff}
					className="text-muted-foreground size-7"
					strokeWidth={1.5}
				/>
			</View>
			<View className="items-center gap-2">
				<Text className="text-center text-lg font-semibold">
					{t({
						message: `${hostName} is offline`,
					})}
				</Text>
				<Text className="text-center text-sm leading-5 text-muted-foreground">
					{t({ message: `Last seen ${lastSeen}` })}
				</Text>
			</View>
			<View className="border-border bg-card w-full rounded-2xl border px-4">
				<HintRow
					leading={<Icon as={Moon} className="text-muted-foreground size-4" />}
				>
					<Trans>It may be asleep</Trans>
				</HintRow>
				<HintRow
					leading={<Icon as={Power} className="text-muted-foreground size-4" />}
				>
					<Trans>Superset may be closed</Trans>
				</HintRow>
				<HintRow
					leading={
						<Icon as={ToggleLeft} className="text-muted-foreground size-4" />
					}
					isLast
				>
					<Trans>Remote Access may be off</Trans>
				</HintRow>
			</View>
			<View className="items-center gap-1">
				<Button
					variant="secondary"
					disabled={checking}
					onPress={() => {
						setChecking(true);
						void refreshPresence().finally(() => setChecking(false));
					}}
				>
					<Text>
						{checking
							? t({ message: "Checking…" })
							: t({ message: "Try again" })}
					</Text>
				</Button>
				{hosts.length > 1 ? (
					<Button
						variant="link"
						onPress={() => router.push("/(authenticated)/(home)/filter/scope")}
					>
						<Text>
							<Trans>Switch host</Trans>
						</Text>
					</Button>
				) : null}
			</View>
		</View>
	);
}
