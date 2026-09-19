import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { Laptop } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { openUrl } from "@/lib/open-url";
import { posthog } from "@/lib/posthog";
import { useRefreshHostsPresence } from "../../hooks/useRefreshHostsPresence";
import { HintRow } from "../HintRow";
import { StepNumber } from "./components/StepNumber";

const REMOTE_ACCESS_DOCS_URL = `${COMPANY.DOCS_URL}/remote-access`;
const PRESENCE_POLL_MS = 5_000;

export function HostSetupPendingView({ hostName }: { hostName: string }) {
	const { t } = useLingui();
	const refreshPresence = useRefreshHostsPresence();

	useEffect(() => {
		posthog.capture("host_setup_pending_shown");
	}, []);

	useEffect(() => {
		const timer = setInterval(() => void refreshPresence(), PRESENCE_POLL_MS);
		return () => clearInterval(timer);
	}, [refreshPresence]);

	return (
		<View className="flex-1 items-center justify-center gap-6 px-8">
			<View className="bg-muted size-14 items-center justify-center rounded-full">
				<Icon
					as={Laptop}
					className="text-foreground size-7"
					strokeWidth={1.5}
				/>
			</View>
			<View className="items-center gap-2">
				<Text className="text-center text-lg font-semibold">
					<Trans>One step left</Trans>
				</Text>
				<Text className="text-center text-sm leading-5 text-muted-foreground">
					{t({
						message: `We found ${hostName}. Turn on Remote Access there to finish.`,
					})}
				</Text>
			</View>
			<View className="border-border bg-card w-full rounded-2xl border px-4">
				<HintRow leading={<StepNumber step={1} />}>
					<Trans>Open Superset on that computer</Trans>
				</HintRow>
				<HintRow leading={<StepNumber step={2} />}>
					<Trans>Go to Settings, then Remote Access</Trans>
				</HintRow>
				<HintRow leading={<StepNumber step={3} />} isLast>
					<Trans>Turn on “Allow remote access to this device via relay”</Trans>
				</HintRow>
			</View>
			<View className="items-center gap-1">
				<View className="flex-row items-center gap-2">
					<Spinner />
					<Text className="text-sm text-muted-foreground">
						<Trans>Waiting for it to connect…</Trans>
					</Text>
				</View>
				<Button variant="link" onPress={() => openUrl(REMOTE_ACCESS_DOCS_URL)}>
					<Text>
						<Trans>Read the setup guide</Trans>
					</Text>
				</Button>
			</View>
		</View>
	);
}
