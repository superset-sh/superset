import { msg } from "@lingui/core/macro";
import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import { LuWebhook } from "react-icons/lu";
import type { TriggerProvider } from "../types";
import { WebhookSentence } from "./WebhookSentence";

type WebhookConfig = Extract<TriggerConfigInput, { kind: "webhook" }>;

export const webhookProvider: TriggerProvider<WebhookConfig> = {
	kind: "webhook",
	label: msg({
		id: "dashboard.automations.providers.webhook.label",
		message: "Webhook triggered",
	}),
	icon: LuWebhook,
	menu: [
		{
			label: msg({
				id: "dashboard.automations.providers.webhook.menuWebhookTriggered",
				message: "Webhook triggered",
			}),
			create: () => ({ kind: "webhook" }),
		},
	],
	renderSentence: (_config, { triggerId, disabled }) => (
		<WebhookSentence triggerId={triggerId} disabled={disabled} />
	),
};
