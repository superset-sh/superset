import { auth } from "@superset/auth/server";
import { posthog } from "@/lib/analytics";

const API_KEY_PREFIX = "sk_live_";

interface ResolvedIdentity {
	userId: string;
	plan: string | null;
	activeOrganizationId: string | null;
	authSource: "api-key" | "bearer";
}

function parseApiKeyMetadata(
	metadata: unknown,
): Record<string, unknown> | null {
	if (!metadata) return null;
	if (typeof metadata === "string") {
		try {
			const parsed = JSON.parse(metadata);
			return parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: null;
		} catch {
			return null;
		}
	}
	return typeof metadata === "object"
		? (metadata as Record<string, unknown>)
		: null;
}

async function resolveIdentity(req: Request): Promise<ResolvedIdentity | null> {
	const apiKeyHeader = req.headers.get("x-api-key");
	if (apiKeyHeader?.startsWith(API_KEY_PREFIX)) {
		try {
			const result = await auth.api.verifyApiKey({
				body: { key: apiKeyHeader },
			});
			if (result.valid && result.key?.referenceId) {
				const metadata = parseApiKeyMetadata(result.key.metadata);
				const orgId =
					typeof metadata?.organizationId === "string"
						? metadata.organizationId
						: null;
				return {
					userId: result.key.referenceId,
					plan: null,
					activeOrganizationId: orgId,
					authSource: "api-key",
				};
			}
		} catch {
			return null;
		}
		return null;
	}

	const session = await auth.api.getSession({ headers: req.headers });
	if (session?.user) {
		const augmented = session.session as typeof session.session & {
			plan?: string | null;
		};
		return {
			userId: session.user.id,
			plan: augmented.plan ?? null,
			activeOrganizationId: session.session.activeOrganizationId ?? null,
			authSource: "bearer",
		};
	}
	return null;
}

interface CliTelemetryBody {
	event: string;
	properties?: Record<string, unknown>;
}

function isValidBody(body: unknown): body is CliTelemetryBody {
	return (
		!!body &&
		typeof body === "object" &&
		typeof (body as { event?: unknown }).event === "string"
	);
}

export async function POST(req: Request): Promise<Response> {
	const identity = await resolveIdentity(req);
	if (!identity) {
		return new Response("Unauthorized", { status: 401 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}
	if (!isValidBody(body)) {
		return new Response("Invalid body", { status: 400 });
	}

	posthog.capture({
		distinctId: identity.userId,
		event: body.event,
		properties: {
			...(body.properties ?? {}),
			source: "cli",
			auth_source: identity.authSource,
			plan: identity.plan,
			active_organization_id: identity.activeOrganizationId,
		},
		groups: identity.activeOrganizationId
			? { organization: identity.activeOrganizationId }
			: undefined,
	});

	return new Response(null, { status: 202 });
}
