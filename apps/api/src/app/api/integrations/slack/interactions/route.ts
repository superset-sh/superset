import { db } from "@superset/db/client";
import { usersSlackUsers } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { DEFAULT_SLACK_MODEL } from "../constants";
import { processAppHomeOpened } from "../events/process-app-home-opened";
import { verifySlackSignature } from "../verify-signature";

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("x-slack-signature");
	const timestamp = request.headers.get("x-slack-request-timestamp");

	if (!signature || !timestamp) {
		return Response.json(
			{ error: "Missing signature headers" },
			{ status: 401 },
		);
	}

	if (!verifySlackSignature({ body, signature, timestamp })) {
		console.error("[slack/interactions] Signature verification failed");
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const params = new URLSearchParams(body);
	const payloadRaw = params.get("payload");
	if (!payloadRaw) {
		return new Response("ok", { status: 200 });
	}

	const payload = JSON.parse(payloadRaw);

	if (payload.type === "block_actions") {
		const teamId: string = payload.team?.id;
		const slackUserId: string = payload.user?.id;

		if (!teamId || !slackUserId) {
			console.error("[slack/interactions] Missing team or user ID");
			return new Response("ok", { status: 200 });
		}

		for (const action of payload.actions ?? []) {
			if (action.action_id === "model_select") {
				const selectedModel =
					action.selected_option?.value ?? DEFAULT_SLACK_MODEL;
				await handleModelSelect({ teamId, slackUserId, selectedModel });
			}

			if (action.action_id === "disconnect_account") {
				await handleDisconnectAccount({ teamId, slackUserId });
			}
		}
	}

	return new Response("ok", { status: 200 });
}

async function handleModelSelect({
	teamId,
	slackUserId,
	selectedModel,
}: {
	teamId: string;
	slackUserId: string;
	selectedModel: string;
}): Promise<void> {
	const existing = await db.query.usersSlackUsers.findFirst({
		where: and(
			eq(usersSlackUsers.slackUserId, slackUserId),
			eq(usersSlackUsers.teamId, teamId),
		),
	});

	if (!existing) {
		console.warn(
			"[slack/interactions] Model select from unlinked user, ignoring:",
			{ slackUserId, teamId },
		);
		return;
	}

	await db
		.update(usersSlackUsers)
		.set({ modelPreference: selectedModel })
		.where(eq(usersSlackUsers.id, existing.id));
}

async function handleDisconnectAccount({
	teamId,
	slackUserId,
}: {
	teamId: string;
	slackUserId: string;
}): Promise<void> {
	await db
		.delete(usersSlackUsers)
		.where(
			and(
				eq(usersSlackUsers.slackUserId, slackUserId),
				eq(usersSlackUsers.teamId, teamId),
			),
		);

	// Republish the home tab so the user sees the "Connect" state
	processAppHomeOpened({
		event: { user: slackUserId, tab: "home" },
		teamId,
		eventId: `disconnect-${Date.now()}`,
	}).catch((err: unknown) => {
		console.error("[slack/interactions] Failed to republish home tab:", err);
	});
}
