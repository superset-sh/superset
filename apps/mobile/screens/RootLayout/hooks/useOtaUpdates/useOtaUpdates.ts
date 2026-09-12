import { useLingui } from "@lingui/react/macro";
import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";

const FOREGROUND_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;

async function downloadIfAvailable() {
	const check = await Updates.checkForUpdateAsync();
	if (check.isAvailable) await Updates.fetchUpdateAsync();
}

/**
 * expo-updates only checks on cold launch, and phones rarely cold-launch, so
 * this checks on foreground too and offers a restart once an update has
 * downloaded. A declined restart still applies on the next launch.
 */
export function useOtaUpdates() {
	const { t } = useLingui();
	const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
	const lastCheckedAt = useRef(Date.now());
	const promptedFor = useRef<string | null>(null);

	useEffect(() => {
		if (!Updates.isEnabled || __DEV__) return;
		const subscription = AppState.addEventListener("change", (status) => {
			if (status !== "active") return;
			if (
				Date.now() - lastCheckedAt.current <
				FOREGROUND_CHECK_MIN_INTERVAL_MS
			) {
				return;
			}
			lastCheckedAt.current = Date.now();
			void downloadIfAvailable().catch(() => {});
		});
		return () => subscription.remove();
	}, []);

	useEffect(() => {
		if (!isUpdatePending || !downloadedUpdate) return;
		const key =
			downloadedUpdate.type === Updates.UpdateInfoType.NEW
				? downloadedUpdate.updateId
				: "rollback";
		if (promptedFor.current === key) return;
		promptedFor.current = key;
		Alert.alert(
			t({ message: "Update ready" }),
			t({ message: "Restart to use the latest version of Superset." }),
			[
				{ text: t({ message: "Later" }), style: "cancel" },
				{
					text: t({ message: "Restart" }),
					onPress: () => void Updates.reloadAsync().catch(() => {}),
				},
			],
		);
	}, [isUpdatePending, downloadedUpdate, t]);
}
