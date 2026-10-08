const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
	to: string;
	title: string;
	body: string;
	data: Record<string, string>;
}

type ExpoPushTicket =
	| { status: "ok" }
	| { status: "error"; message?: string; details?: { error?: string } };

/** Sends the messages and returns the tokens Expo says no longer exist. */
export async function sendExpoPush(
	messages: ExpoPushMessage[],
	fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
	if (messages.length === 0) return [];
	const response = await fetchImpl(EXPO_PUSH_URL, {
		method: "POST",
		headers: {
			accept: "application/json",
			"content-type": "application/json",
		},
		body: JSON.stringify(
			messages.map((message) => ({ ...message, sound: "default" })),
		),
		signal: AbortSignal.timeout(5_000),
	});
	if (!response.ok) {
		throw new Error(
			`Expo push failed: ${response.status} ${await response.text()}`,
		);
	}
	const { data } = (await response.json()) as { data?: ExpoPushTicket[] };
	return (data ?? []).flatMap((ticket, index) =>
		ticket.status === "error" &&
		ticket.details?.error === "DeviceNotRegistered" &&
		messages[index]
			? [messages[index].to]
			: [],
	);
}
