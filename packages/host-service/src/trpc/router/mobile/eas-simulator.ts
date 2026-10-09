import { TRPCError } from "@trpc/server";
import { z } from "zod";

const EXPO_GRAPHQL_URL = "https://api.expo.dev/graphql";

export interface EasSimulatorSession {
	sessionId: string;
	name: string | null;
	baseUrl: string;
	token: string;
	deviceId: string;
}

function workspaceTag(): string | undefined {
	return process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
}

export function easSimulatorConfigured(): boolean {
	return Boolean(
		process.env.EXPO_TOKEN && process.env.EAS_PROJECT_ID && workspaceTag(),
	);
}

const RUNNING_SESSIONS = `
	query RunningDeviceRunSessions($appId: String!, $filter: DeviceRunSessionFilterInput) {
		app {
			byId(appId: $appId) {
				deviceRunSessionsPaginated(first: 10, filter: $filter) {
					edges { node { id name } }
				}
			}
		}
	}`;

// The session types declare these fields with different nullability, and
// GraphQL rejects one unaliased selection across them.
const SESSION_PREVIEW = `
	query DeviceRunSessionPreview($id: ID!) {
		deviceRunSessions {
			byId(deviceRunSessionId: $id) {
				remoteConfig {
					... on AgentDeviceRunSessionRemoteConfig { agentDeviceUrl: webPreviewUrl agentDeviceToken: webPreviewToken }
					... on ArgentRunSessionRemoteConfig { argentUrl: webPreviewUrl argentToken: webPreviewToken }
					... on AppiumRunSessionRemoteConfig { appiumUrl: webPreviewUrl appiumToken: webPreviewToken }
					... on WebPreviewOnlyRunSessionRemoteConfig { previewOnlyUrl: webPreviewUrl previewOnlyToken: webPreviewToken }
				}
			}
		}
	}`;

const runningSchema = z.object({
	app: z.object({
		byId: z.object({
			deviceRunSessionsPaginated: z.object({
				edges: z.array(
					z.object({
						node: z.object({ id: z.string(), name: z.string().nullish() }),
					}),
				),
			}),
		}),
	}),
});

const previewSchema = z.object({
	deviceRunSessions: z.object({
		byId: z.object({
			remoteConfig: z.record(z.string(), z.string().nullish()).nullish(),
		}),
	}),
});

async function expoGraphql(
	query: string,
	variables: Record<string, unknown>,
): Promise<unknown> {
	const response = await fetch(EXPO_GRAPHQL_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.EXPO_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query, variables }),
	});
	const body = (await response.json().catch(() => null)) as {
		data?: unknown;
		errors?: { message: string }[];
	} | null;
	if (!response.ok || !body || body.errors?.length) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `EAS Simulator request failed (${response.status}): ${
				body?.errors?.map((error) => error.message).join("; ") ?? "no body"
			}`,
		});
	}
	return body.data;
}

/** Expo returns only its own preview page; the page reaches the simulator
 * at this host, named after the last path segment of that page. */
function previewHost(webPreviewUrl: string): string {
	const previewId = new URL(webPreviewUrl).pathname.split("/").pop();
	return `https://web-preview-${previewId}.eas-simulator.ngrok.dev`;
}

const deviceIds = new Map<string, string>();

async function readDeviceId(
	sessionId: string,
	baseUrl: string,
	token: string,
): Promise<string | null> {
	const known = deviceIds.get(sessionId);
	if (known) return known;
	const response = await fetch(`${baseUrl}/api`, {
		headers: { Authorization: `Bearer ${token}` },
	}).catch(() => null);
	if (!response?.ok) return null;
	const { device } = z
		.object({ device: z.string() })
		.parse(await response.json());
	deviceIds.set(sessionId, device);
	return device;
}

async function attach(
	sessionId: string,
	name: string | null,
): Promise<EasSimulatorSession | null> {
	const preview =
		previewSchema.parse(await expoGraphql(SESSION_PREVIEW, { id: sessionId }))
			.deviceRunSessions.byId.remoteConfig ?? {};
	const field = (suffix: string) =>
		Object.entries(preview).find(([key]) => key.endsWith(suffix))?.[1];
	const webPreviewUrl = field("Url");
	const token = field("Token");
	if (!webPreviewUrl || !token) return null;
	const baseUrl = previewHost(webPreviewUrl);
	const deviceId = await readDeviceId(sessionId, baseUrl, token);
	return deviceId ? { sessionId, name, baseUrl, token, deviceId } : null;
}

/** The simulators an agent started for this workspace. Whoever starts one
 * tags it with the workspace id; nothing here starts or stops a session. */
export async function listEasSimulatorSessions(): Promise<
	EasSimulatorSession[]
> {
	const running = runningSchema.parse(
		await expoGraphql(RUNNING_SESSIONS, {
			appId: process.env.EAS_PROJECT_ID,
			filter: { statuses: ["IN_PROGRESS"], tags: [workspaceTag()] },
		}),
	).app.byId.deviceRunSessionsPaginated.edges;
	const sessions = await Promise.all(
		running.map(({ node }) => attach(node.id, node.name ?? null)),
	);
	return sessions.filter((session) => session !== null);
}
