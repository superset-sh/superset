import { resolveGitlabSandboxProxyConfig } from "@superset/trpc/lib/gitlab/proxy-config";

export const runtime = "nodejs";
export const maxDuration = 800;
export const dynamic = "force-dynamic";
type Broker = (request: Request) => Promise<Response>;
let cached: { key: string; broker: Promise<Broker> } | undefined;

export async function GET(request: Request): Promise<Response> {
	const unavailable = () => {
		void request.body?.cancel().catch(() => {});
		return new Response("GitLab sandbox proxy unavailable", {
			status: 503,
			headers: { "cache-control": "no-store" },
		});
	};
	const config = resolveGitlabSandboxProxyConfig(process.env);
	if (!config) return unavailable();
	const key = JSON.stringify(config);
	if (!cached || cached.key !== key)
		cached = {
			key,
			broker: import("@superset/trpc/lib/gitlab/sandbox-broker").then(
				({ createGitlabSandboxBroker }) =>
					createGitlabSandboxBroker(config, { binaryTimeoutMs: 790_000 }),
			),
		};
	const current = cached;
	try {
		return await (await current.broker)(request);
	} catch {
		if (cached === current) cached = undefined;
		return unavailable();
	}
}

export const HEAD = GET;
export const POST = GET;
export const PUT = GET;
