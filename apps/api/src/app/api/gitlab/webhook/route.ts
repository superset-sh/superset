import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { connections, type SelectConnection } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { readGitlabConfig } from "@superset/trpc/lib/gitlab/config";
import { gitlabScopeAllows } from "@superset/trpc/lib/gitlab/scope";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { dispatchRecordedAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { recordAutomationEvent } from "@/lib/automations/recordAutomationEvent";
import { cappedBody } from "@/lib/webhooks/body";
import { enrichGitlabDelivery } from "../enrichGitlabDelivery";
import { gitlabDeliverySchema } from "../normalizeGitlabDelivery";

function equalSecret(provided: string, expected: string): boolean {
	if (
		!provided ||
		!expected ||
		provided.length > 1024 ||
		expected.length > 1024
	)
		return false;
	const left = Buffer.from(provided);
	const right = Buffer.from(expected);
	return left.length === right.length && timingSafeEqual(left, right);
}
function activeOrganizationConnection(
	row: SelectConnection | undefined,
): row is SelectConnection {
	return Boolean(
		row &&
			row.connector === "gitlab" &&
			row.ownerKind === "org" &&
			!row.disconnectedAt,
	);
}
function generation(row: SelectConnection): string {
	return JSON.stringify({
		id: row.id,
		organizationId: row.organizationId,
		connector: row.connector,
		ownerKind: row.ownerKind,
		state: row.state,
	});
}

export async function POST(request: Request) {
	const url = new URL(request.url);
	const ids = url.searchParams.getAll("connection");
	const token = request.headers.get("x-gitlab-token");
	if (ids.length !== 1 || !z.uuid().safeParse(ids[0]).success || !token)
		return Response.json(
			{ error: "Missing connection or token" },
			{ status: 401 },
		);
	const connectionId = ids[0];
	if (!connectionId)
		return Response.json({ error: "Invalid token" }, { status: 401 });
	const suppliedId = request.headers.get("x-gitlab-event-uuid");
	if (
		suppliedId !== null &&
		(!/^[A-Za-z0-9._:-]+$/.test(suppliedId) || suppliedId.length > 128)
	)
		return Response.json({ error: "Invalid delivery ID" }, { status: 400 });
	const deliveryId = suppliedId ?? crypto.randomUUID();
	const connection = await db.query.connections.findFirst({
		where: and(
			eq(connections.id, connectionId),
			eq(connections.connector, "gitlab"),
			eq(connections.ownerKind, "org"),
			isNull(connections.disconnectedAt),
		),
	});
	const config = readGitlabConfig(connection?.state);
	if (
		!activeOrganizationConnection(connection) ||
		!config ||
		!equalSecret(token, config.webhookSecret)
	)
		return Response.json({ error: "Invalid token" }, { status: 401 });
	const initialGeneration = generation(connection);
	const body = await cappedBody(request);
	if (body instanceof Response) return body;
	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	const parsed = gitlabDeliverySchema.safeParse(payload);
	if (!parsed.success)
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	const delivery = await enrichGitlabDelivery({
		organizationId: connection.organizationId,
		connectionId: connection.id,
		config,
		deliveryId,
		payload,
	});
	const recorded = await withConnectionLock(connectionId, async (tx) => {
		const [current] = await tx
			.select()
			.from(connections)
			.where(
				and(
					eq(connections.id, connectionId),
					eq(connections.organizationId, connection.organizationId),
					eq(connections.connector, "gitlab"),
					eq(connections.ownerKind, "org"),
					isNull(connections.disconnectedAt),
				),
			)
			.limit(1)
			.for("share");
		const currentConfig = readGitlabConfig(current?.state);
		if (
			!activeOrganizationConnection(current) ||
			!currentConfig ||
			generation(current) !== initialGeneration ||
			!equalSecret(token, currentConfig.webhookSecret)
		)
			return Response.json({ error: "Invalid token" }, { status: 401 });
		if (
			!gitlabScopeAllows(
				currentConfig,
				parsed.data.project?.path_with_namespace,
			)
		)
			return Response.json(
				{ error: "Project outside connection scope" },
				{ status: 403 },
			);
		if ("skip" in delivery) {
			if (
				delivery.skip === "GitLab project outside connection scope" ||
				delivery.skip === "GitLab project does not match connection instance"
			)
				return Response.json({ error: delivery.skip }, { status: 403 });
			return Response.json({ status: "skipped", reason: delivery.skip });
		}
		const inserted = await recordAutomationEvent(tx, {
			...delivery.event,
			dispatchInput: delivery.dispatch,
		});
		return { delivery, inserted };
	});
	if (recorded instanceof Response) return recorded;
	return Response.json(
		await dispatchRecordedAutomationEvent(recorded.delivery, recorded.inserted),
	);
}
