export function formatSubscriptionStarted({
	organizationName,
	planName,
	billingInterval,
	amount,
	seatCount,
}: {
	organizationName: string;
	planName: string;
	billingInterval: string;
	amount: string;
	seatCount: number;
}): unknown[] {
	return [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: `🎉 New Subscription Started`,
				emoji: true,
			},
		},
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `*Organization:*\n${organizationName}` },
				{ type: "mrkdwn", text: `*Plan:*\n${planName}` },
				{ type: "mrkdwn", text: `*Billing:*\n${billingInterval}` },
				{ type: "mrkdwn", text: `*Amount:*\n${amount}/seat` },
				{ type: "mrkdwn", text: `*Seats:*\n${seatCount}` },
			],
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `Subscription activated for *${organizationName}*`,
				},
			],
		},
	];
}

export function formatSubscriptionCancelled({
	organizationName,
	planName,
	accessEndsAt,
}: {
	organizationName: string;
	planName: string;
	accessEndsAt: Date;
}): unknown[] {
	const endsAtStr = accessEndsAt.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

	return [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: `😞 Subscription Cancelled`,
				emoji: true,
			},
		},
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `*Organization:*\n${organizationName}` },
				{ type: "mrkdwn", text: `*Plan:*\n${planName}` },
				{ type: "mrkdwn", text: `*Access ends:*\n${endsAtStr}` },
			],
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `*${organizationName}* cancelled their ${planName} plan`,
				},
			],
		},
	];
}

export function formatPaymentFailed({
	organizationName,
	planName,
	amount,
}: {
	organizationName: string;
	planName: string;
	amount: string;
}): unknown[] {
	return [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: `🚨 Payment Failed`,
				emoji: true,
			},
		},
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `*Organization:*\n${organizationName}` },
				{ type: "mrkdwn", text: `*Plan:*\n${planName}` },
				{ type: "mrkdwn", text: `*Amount:*\n${amount}` },
			],
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `Payment of ${amount} failed for *${organizationName}*`,
				},
			],
		},
	];
}

export function formatPaymentSucceeded({
	organizationName,
	planName,
	amount,
	periodStart,
	periodEnd,
}: {
	organizationName: string;
	planName: string;
	amount: string;
	periodStart: string;
	periodEnd: string;
}): unknown[] {
	return [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: `✅ Payment Succeeded`,
				emoji: true,
			},
		},
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `*Organization:*\n${organizationName}` },
				{ type: "mrkdwn", text: `*Plan:*\n${planName}` },
				{ type: "mrkdwn", text: `*Amount:*\n${amount}` },
				{
					type: "mrkdwn",
					text: `*Period:*\n${periodStart} – ${periodEnd}`,
				},
			],
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `Payment of ${amount} received from *${organizationName}*`,
				},
			],
		},
	];
}

export function formatPlanChanged({
	organizationName,
	planName,
	newAmount,
	newInterval,
}: {
	organizationName: string;
	planName: string;
	newAmount: string;
	newInterval: string;
}): unknown[] {
	return [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: `🔄 Plan Changed`,
				emoji: true,
			},
		},
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `*Organization:*\n${organizationName}` },
				{ type: "mrkdwn", text: `*Plan:*\n${planName}` },
				{ type: "mrkdwn", text: `*New amount:*\n${newAmount}` },
				{ type: "mrkdwn", text: `*Interval:*\n${newInterval}` },
			],
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `*${organizationName}* changed their subscription`,
				},
			],
		},
	];
}
