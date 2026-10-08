import { useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFeatureFlag } from "posthog-react-native";
import { useEffect } from "react";
import { Alert } from "react-native";
import { errorCopy } from "@/lib/errors";
import { useVoiceSession } from "@/lib/voice/useVoiceSession";

/**
 * `superset://voice`: an entry point, not a screen. Starts the session in the
 * layer above the Stack and gets out of the way. In development,
 * `superset://voice?say=…` also sends the text as if it had been spoken.
 */
export function VoiceEntryScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const { start, sayText, setMuted } = useVoiceSession();
	const { say } = useLocalSearchParams<{ say?: string }>();
	const enabled = Boolean(useFeatureFlag(FEATURE_FLAGS.MOBILE_VOICE_MODE));

	useEffect(() => {
		if (enabled) {
			void start()
				.then(() => {
					if (__DEV__ && say) {
						setMuted(true);
						sayText(say);
					}
				})
				.catch((error: unknown) =>
					Alert.alert(
						t({ message: "Couldn't start voice mode" }),
						errorCopy(error),
					),
				);
		}
		if (router.canGoBack()) router.back();
		else router.replace("/(authenticated)/(home)");
	}, [enabled, start, sayText, setMuted, say, router, t]);

	return null;
}
