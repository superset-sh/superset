import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { Alert, Linking } from "react-native";

/**
 * Opens an external URL. The OS can refuse — web browsing is blockable by
 * parental controls or a management profile — so surface that instead of
 * leaving an unhandled rejection and a tap that looks dead.
 */
export function openUrl(url: string) {
	Linking.openURL(url).catch(() => {
		Alert.alert(i18n._(msg({ message: "Could not open link" })), url);
	});
}
