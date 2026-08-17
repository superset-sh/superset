import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import { LuWebhook } from "react-icons/lu";
import type { TriggerProvider } from "../types";

type WebhookConfig = Extract<TriggerConfigInput, { kind: "webhook" }>;

export const webhookProvider: TriggerProvider<WebhookConfig> = {
	kind: "webhook",
	label: "Webhook Triggered",
	icon: LuWebhook,
	menu: [{ label: "Webhook Triggered", create: () => ({ kind: "webhook" }) }],
	renderSentence: () => (
		<span className="text-muted-foreground text-sm">
			Triggered by an incoming webhook
		</span>
	),
};
