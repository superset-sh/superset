import { Trans, useLingui } from "@lingui/react/macro";
import { WifiOff } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useRefreshHostsPresence } from "../../hooks/useRefreshHostsPresence";

export function HostPresenceUnknownView({ hostName }: { hostName: string }) {
	const { t } = useLingui();
	const refreshPresence = useRefreshHostsPresence();
	const [checking, setChecking] = useState(false);

	return (
		<View className="grow items-center justify-center gap-6 px-8">
			<View className="bg-muted size-14 items-center justify-center rounded-full">
				<Icon
					as={WifiOff}
					className="text-muted-foreground size-7"
					strokeWidth={1.5}
				/>
			</View>
			<View className="items-center gap-2">
				<Text className="text-center text-lg font-semibold">
					{t({ message: `Can’t check ${hostName}` })}
				</Text>
				<Text className="text-center text-sm leading-5 text-muted-foreground">
					<Trans>
						We couldn’t reach Superset to see if it’s online. Check your
						connection and try again.
					</Trans>
				</Text>
			</View>
			<Button
				className="h-auto min-h-10"
				variant="secondary"
				disabled={checking}
				onPress={() => {
					setChecking(true);
					void refreshPresence().finally(() => setChecking(false));
				}}
			>
				<Text>
					{checking ? t({ message: "Checking…" }) : t({ message: "Try again" })}
				</Text>
			</Button>
		</View>
	);
}
