import { db } from "@superset/db/client";
import { integrationConnections, userIdentities } from "@superset/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { posthog } from "@/lib/analytics";
import { DEFAULT_SLACK_MODEL } from "../constants";
import { processAppHomeOpened } from "../events/process-app-home-opened";
import { verifySlackSignature } from "../verify-signature";

type SlackInteractionAction = {
	action_id?: string;
	selected_option?: { value?: string };
};

type SlackInteractionPayload = {
	type?: string;
	team?: { id?: string };
	user?: { id?: string };
	actions?: unknown;
};

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

	let payload: SlackInteractionPayload;
	try {
		const parsed = JSON.parse(payloadRaw);
		if (parsed === null || typeof parsed !== "object") {
			console.error("[slack/interactions] Invalid JSON payload");
			return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
		}
		payload = parsed as SlackInteractionPayload;
	} catch {
		console.error("[slack/interactions] Failed to parse JSON payload");
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	if (payload.type === "block_actions") {
		const teamId = payload.team?.id;
		const slackUserId = payload.user?.id;

		if (
			typeof teamId !== "string" ||
			teamId.length === 0 ||
			typeof slackUserId !== "string" ||
			slackUserId.length === 0
		) {
			console.error("[slack/interactions] Missing team or user ID");
			return new Response("ok", { status: 200 });
		}

		// The identity is scoped by organization, and an interaction payload only
		// names the Slack workspace — so resolve the connection to get one.
		const connection = await db.query.integrationConnections.findFirst({
			where: and(
				eq(integrationConnections.provider, "slack"),
				eq(integrationConnections.externalOrgId, teamId),
				isNull(integrationConnections.disconnectedAt),
			),
			columns: { organizationId: true },
			orderBy: [
				desc(integrationConnections.updatedAt),
				desc(integrationConnections.id),
			],
		});
		if (!connection) {
			console.warn("[slack/interactions] No active connection for team:", {
				teamId,
			});
			return new Response("ok", { status: 200 });
		}

		const actions = Array.isArray(payload.actions)
			? payload.actions.filter(isSlackInteractionAction)
			: [];
		for (const action of actions) {
			if (action.action_id === "model_select") {
				const selectedModel =
					action.selected_option?.value ?? DEFAULT_SLACK_MODEL;
				await handleModelSelect({
					organizationId: connection.organizationId,
					teamId,
					slackUserId,
					selectedModel,
				});
			}

			if (action.action_id === "disconnect_account") {
				await handleDisconnectAccount({
					organizationId: connection.organizationId,
					teamId,
					slackUserId,
				});
			}
		}
	}

	return new Response("ok", { status: 200 });
}

async function handleModelSelect({
	organizationId,
	teamId,
	slackUserId,
	selectedModel,
}: {
	organizationId: string;
	teamId: string;
	slackUserId: string;
	selectedModel: string;
}): Promise<void> {
	const existing = await db.query.userIdentities.findFirst({
		where: and(
			eq(userIdentities.organizationId, organizationId),
			eq(userIdentities.provider, "slack"),
			eq(userIdentities.externalId, slackUserId),
			eq(userIdentities.externalScopeId, teamId),
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
		.update(userIdentities)
		.set({ metadata: { provider: "slack", modelPreference: selectedModel } })
		.where(eq(userIdentities.id, existing.id));

	posthog.capture({
		distinctId: existing.userId,
		event: "slack_model_changed",
		properties: { model: selectedModel },
	});
}

async function handleDisconnectAccount({
	organizationId,
	teamId,
	slackUserId,
}: {
	organizationId: string;
	teamId: string;
	slackUserId: string;
}): Promise<void> {
	const existing = await db.query.userIdentities.findFirst({
		where: and(
			eq(userIdentities.organizationId, organizationId),
			eq(userIdentities.provider, "slack"),
			eq(userIdentities.externalId, slackUserId),
			eq(userIdentities.externalScopeId, teamId),
		),
		columns: { userId: true },
	});

	await db
		.delete(userIdentities)
		.where(
			and(
				eq(userIdentities.organizationId, organizationId),
				eq(userIdentities.provider, "slack"),
				eq(userIdentities.externalId, slackUserId),
				eq(userIdentities.externalScopeId, teamId),
			),
		);

	if (existing) {
		posthog.capture({
			distinctId: existing.userId,
			event: "slack_disconnected",
			properties: { team_id: teamId },
		});
	}

	// Republish the home tab so the user sees the "Connect" state
	processAppHomeOpened({
		event: { user: slackUserId, tab: "home" },
		teamId,
		eventId: `disconnect-${Date.now()}`,
	}).catch((err: unknown) => {
		console.error("[slack/interactions] Failed to republish home tab:", err);
	});
}

function isSlackInteractionAction(
	action: unknown,
): action is SlackInteractionAction {
	if (action === null || typeof action !== "object" || Array.isArray(action)) {
		return false;
	}

	const candidate = action as Record<string, unknown>;
	if ("action_id" in candidate && typeof candidate.action_id !== "string") {
		return false;
	}

	if ("selected_option" in candidate) {
		if (
			candidate.selected_option === null ||
			typeof candidate.selected_option !== "object" ||
			Array.isArray(candidate.selected_option)
		) {
			return false;
		}

		const selectedOption = candidate.selected_option as Record<string, unknown>;
		if ("value" in selectedOption && typeof selectedOption.value !== "string") {
			return false;
		}
	}

	return true;
}
