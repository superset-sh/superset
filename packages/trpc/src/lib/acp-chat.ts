import { FEATURE_FLAGS } from "@superset/shared/constants";
import { posthog } from "./analytics";

export async function acpChatEnabled(userId: string): Promise<boolean> {
	const enabled = await posthog
		.isFeatureEnabled(FEATURE_FLAGS.ACP_CHAT, userId, {
			sendFeatureFlagEvents: false,
		})
		.catch(() => undefined);
	return enabled === true;
}
