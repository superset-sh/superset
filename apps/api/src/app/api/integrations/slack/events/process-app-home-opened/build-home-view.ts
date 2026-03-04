import type { KnownBlock } from "@slack/types";
import { DEFAULT_SLACK_MODEL, SLACK_MODELS } from "../../constants";

interface BuildHomeViewParams {
	modelPreference?: string;
	externalOrgName?: string;
	isUserLinked: boolean;
	userName?: string;
	connectUrl?: string;
}

export function buildHomeView({
	modelPreference,
	externalOrgName,
	isUserLinked,
	userName,
	connectUrl,
}: BuildHomeViewParams): { type: "home"; blocks: KnownBlock[] } {
	const currentModel = modelPreference ?? DEFAULT_SLACK_MODEL;
	const currentModelOption =
		SLACK_MODELS.find((m) => m.value === currentModel) ?? SLACK_MODELS[0];

	const blocks: KnownBlock[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "Welcome to Superset",
				emoji: true,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "Superset is your AI coding assistant - spin up cloud agents, plan tasks, do code reviews, and more, all without leaving Slack.",
			},
		},
		{ type: "divider" },

		{
			type: "header",
			text: {
				type: "plain_text",
				text: "Settings",
				emoji: true,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*AI Model*\nChoose which Claude model to use for conversations.",
			},
			accessory: {
				type: "static_select",
				action_id: "model_select",
				placeholder: {
					type: "plain_text",
					text: "Select a model",
				},
				options: SLACK_MODELS.map((m) => ({
					text: { type: "plain_text", text: m.label },
					value: m.value,
				})),
				initial_option: {
					text: { type: "plain_text", text: currentModelOption.label },
					value: currentModelOption.value,
				},
			},
		},

		{
			type: "header",
			text: {
				type: "plain_text",
				text: "Account",
				emoji: true,
			},
		},
	];

	if (isUserLinked && userName) {
		blocks.push(
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `Connected as *${userName}*${externalOrgName ? ` in ${externalOrgName}` : ""}`,
					},
				],
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						action_id: "disconnect_account",
						text: {
							type: "plain_text",
							text: "Disconnect Account",
							emoji: true,
						},
						style: "danger",
						confirm: {
							title: { type: "plain_text", text: "Disconnect Account" },
							text: {
								type: "mrkdwn",
								text: "Are you sure you want to disconnect your Superset account?",
							},
							confirm: { type: "plain_text", text: "Disconnect" },
							deny: { type: "plain_text", text: "Cancel" },
						},
					},
				],
			},
		);
	} else {
		blocks.push(
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: "Link your Slack account to your Superset account to personalize your experience.",
				},
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						text: {
							type: "plain_text",
							text: "Connect Account",
							emoji: true,
						},
						url: connectUrl,
					},
				],
			},
		);
	}

	blocks.push(
		{ type: "divider" },
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "Getting Started",
				emoji: true,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*DM the bot* — Start a direct message with Superset for instant access to AI assistance.\n\n*@mention in channels* — Mention <@superset> in any channel to get help in context.\n\n*Link unfurling* — Paste a Superset task link and it will automatically preview in the conversation.",
			},
		},
		{ type: "divider" },
		{
			type: "actions",
			elements: [
				{
					type: "button",
					text: {
						type: "plain_text",
						text: "Open Superset",
						emoji: true,
					},
					url: "https://app.superset.sh",
					style: "primary",
				},
			],
		},
	);

	return { type: "home", blocks };
}
