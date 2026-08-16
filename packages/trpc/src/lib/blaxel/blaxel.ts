/**
 * Called directly rather than behind a provider interface: there is one
 * provider, so an interface would be a second thing to keep in sync with no
 * second implementation to justify it.
 *
 * Previews are private, so Blaxel's edge rejects unauthenticated requests
 * before they reach host-service. Clients connect directly with a brokered
 * token — no relay hop, so websockets work and the sandbox can still sleep.
 */
import { SandboxInstance, settings } from "@blaxel/core";
import { SANDBOX_CREDENTIAL_PLACEHOLDER } from "@superset/shared/constants";
import { TRPCError } from "@trpc/server";
import { env } from "../../env";

/** Short enough that a leaked token is bounded; minted per access. */
const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;
const PREVIEW_NAME = "hostsvc";
const HOST_SERVICE_PORT = 4879;

interface ProxyRoute {
	destinations: string[];
	headers: Record<string, string>;
	secrets: Record<string, string>;
}

/**
 * One route per model provider, each carrying the header that provider
 * authenticates with. Secrets are scoped to their own rule — a key declared
 * here cannot be resolved by any other destination.
 */
function agentCredentialRoutes(): {
	envs: Array<{ name: string; value: string }>;
	routing: ProxyRoute[];
} {
	const envs = [
		{ name: "ANTHROPIC_API_KEY", value: SANDBOX_CREDENTIAL_PLACEHOLDER },
		{ name: "OPENAI_API_KEY", value: SANDBOX_CREDENTIAL_PLACEHOLDER },
	];
	const routing: ProxyRoute[] = [
		{
			destinations: ["api.anthropic.com"],
			headers: { "x-api-key": "{{SECRET:anthropic-api-key}}" },
			secrets: { "anthropic-api-key": env.ANTHROPIC_API_KEY },
		},
		{
			destinations: ["api.openai.com"],
			headers: { Authorization: "Bearer {{SECRET:openai-api-key}}" },
			secrets: { "openai-api-key": env.OPENAI_API_KEY },
		},
	];

	return { envs, routing };
}

function configureBlaxel(): void {
	settings.setConfig({
		apiKey: env.BLAXEL_API_KEY,
		workspace: env.BLAXEL_WORKSPACE,
	});
}

export interface ProvisionedSandbox {
	providerSandboxId: string;
	sandboxUrl: string;
}

/**
 * Creates the sandbox and its private preview. Returns once the preview URL
 * exists — not once anything is listening on it, which is the caller's job.
 */
export async function provisionSandbox(args: {
	name: string;
	image: string;
	memoryMb?: number;
	region?: string;
}): Promise<ProvisionedSandbox> {
	configureBlaxel();
	const memoryMb = args.memoryMb ?? 4096;
	const region = args.region ?? env.BLAXEL_REGION;
	const { envs, routing } = agentCredentialRoutes();

	const sandbox = await SandboxInstance.createIfNotExists({
		name: args.name,
		image: args.image,
		memory: memoryMb,
		// Without disk-backed root the writable layer is tmpfs in RAM, and a
		// checkout plus node_modules is write-heavy enough to exhaust it.
		storageMb: 20480,
		ports: [{ target: HOST_SERVICE_PORT, protocol: "HTTP" }],
		region,
		envs,
		// Routing is fixed at creation, so a sandbox can never be re-pointed at
		// a different secret later in its life.
		network: { proxy: { routing } },
	} as never);

	// The desktop renderer is a browser: without CORS on the provider's edge
	// every request to the sandbox fails preflight. The wildcard origin grants
	// no ambient authority — the preview token gates the sandbox and a browser
	// never attaches it on its own, so a hostile page can't ride a user's
	// session the way it could with a cookie. It does mean a *leaked* token is
	// usable from any origin, which is one more reason the TTL is short.
	const preview = await sandbox.previews.createIfNotExists({
		metadata: { name: PREVIEW_NAME },
		spec: {
			port: HOST_SERVICE_PORT,
			public: false,
			responseHeaders: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers": "*",
				"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
			},
		},
	} as never);

	const sandboxUrl = preview.spec?.url;
	if (!sandboxUrl) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Sandbox preview has no URL",
		});
	}
	return { providerSandboxId: args.name, sandboxUrl };
}

export interface PreviewAccess {
	url: string;
	token: string;
	expiresAt: Date;
}

export async function mintPreviewAccess(
	providerSandboxId: string,
): Promise<PreviewAccess> {
	configureBlaxel();
	const sandbox = await SandboxInstance.get(providerSandboxId);
	const preview = await sandbox.previews.get(PREVIEW_NAME);
	const expiresAt = new Date(Date.now() + PREVIEW_TOKEN_TTL_MS);
	const token = await preview.tokens.create(expiresAt);
	const value = (token as { value?: string }).value;
	const url = preview.spec?.url;
	if (!value || !url) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Could not mint sandbox access token",
		});
	}
	return { url, token: value, expiresAt };
}

/** Best-effort: a sandbox already gone is the state we wanted. */
export async function deleteSandbox(providerSandboxId: string): Promise<void> {
	configureBlaxel();
	try {
		await SandboxInstance.delete(providerSandboxId);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!/not found|404/i.test(message)) throw error;
	}
}
