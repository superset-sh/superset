import { defineSandboxProxy, type ProxyMeta } from "@vercel/sandbox/proxy";

export type GitlabSandboxIdentity = Pick<
	ProxyMeta,
	"teamId" | "projectId" | "sandboxId" | "sandboxName"
>;
export interface GitlabForwardedMetadata {
	host: string;
	scheme: string;
	port: string;
	path: string;
}
export interface GitlabSandboxProxyConfig {
	issuer: string;
	forwardURL: string;
	teamId: string;
	projectId: string;
}
const identityValue = (value: unknown): value is string =>
	typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(value);

const hasControlCharacters = (value: string) =>
	Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127;
	});

function forwardedMetadata(request: Request): GitlabForwardedMetadata {
	const host = request.headers.get("vercel-forwarded-host") ?? "";
	const scheme = request.headers.get("vercel-forwarded-scheme") ?? "";
	const port = request.headers.get("vercel-forwarded-port") ?? "";
	const path = request.headers.get("vercel-forwarded-path") ?? "";
	if (
		host.length > 253 ||
		!host
			.split(".")
			.every((label) =>
				/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
			) ||
		scheme !== "https" ||
		port !== "443" ||
		path.length > 16384 ||
		!path.startsWith("/") ||
		path.startsWith("//") ||
		/[\s\\#]/.test(path) ||
		hasControlCharacters(path)
	)
		throw new Error();
	for (const segment of (path.split("?")[0] ?? "").split("/")) {
		let decoded = segment;
		for (let round = 0; round < 8; round++) {
			if (
				decoded.includes("\\") ||
				decoded.split(/[\\/]/).some((part) => part === "." || part === "..") ||
				hasControlCharacters(decoded)
			)
				throw new Error();
			let next: string;
			try {
				next = decodeURIComponent(decoded);
			} catch {
				if (round === 0) throw new Error();
				break;
			}
			if (next === decoded) break;
			if (round === 7) throw new Error();
			decoded = next;
		}
	}
	return { host, scheme, port, path };
}

export function createGitlabSandboxProxy(
	config: GitlabSandboxProxyConfig,
	handler: (
		request: Request,
		identity: GitlabSandboxIdentity,
		raw: GitlabForwardedMetadata,
	) => Promise<Response>,
): (request: Request) => Promise<Response> {
	let endpoint: URL;
	try {
		endpoint = new URL(config.forwardURL);
		if (
			!/^https:\/\/oidc\.vercel\.com\/[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(
				config.issuer,
			) ||
			!identityValue(config.teamId) ||
			!identityValue(config.projectId) ||
			endpoint.protocol !== "https:" ||
			endpoint.username ||
			endpoint.password ||
			endpoint.search ||
			endpoint.hash ||
			endpoint.port ||
			endpoint.origin + endpoint.pathname.replace(/\/+$/, "") !==
				config.forwardURL
		)
			throw new Error();
	} catch {
		throw new Error("Invalid GitLab sandbox proxy configuration");
	}
	return async (request) => {
		const forbidden = () => {
			void request.body?.cancel().catch(() => {});
			return new Response("Forbidden", { status: 403 });
		};
		try {
			if (request.signal.aborted) return forbidden();
			const raw = forwardedMetadata(request);
			const jwt = request.headers.get("vercel-sandbox-oidc-token") ?? "";
			if (
				jwt.length > 16384 ||
				!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)
			)
				return forbidden();
			const claims = JSON.parse(
				Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"),
			);
			const now = Math.floor(Date.now() / 1000);
			if (
				!claims ||
				typeof claims !== "object" ||
				Array.isArray(claims) ||
				claims.iss !== config.issuer ||
				!(
					claims.aud === config.forwardURL ||
					(Array.isArray(claims.aud) &&
						claims.aud.length <= 8 &&
						claims.aud.every(
							(audience: unknown) => typeof audience === "string",
						) &&
						claims.aud.includes(config.forwardURL))
				) ||
				claims.team_id !== config.teamId ||
				claims.project_id !== config.projectId ||
				!identityValue(claims.sandbox_id) ||
				!identityValue(claims.sandbox_name) ||
				!Number.isSafeInteger(claims.exp) ||
				claims.exp <= now ||
				!Number.isSafeInteger(claims.iat) ||
				claims.iat > now + 60 ||
				claims.iat > claims.exp
			)
				return forbidden();
			const incoming = new URL(request.url);
			const basePath = endpoint.pathname.replace(/\/+$/, "");
			const forwardedPath = new URL(raw.path, endpoint.origin).pathname;
			if (
				incoming.origin !== endpoint.origin ||
				(incoming.pathname !== (basePath || "/") &&
					incoming.pathname !== basePath + forwardedPath)
			)
				return forbidden();
			const verificationRequest = new Request(
				endpoint.origin + basePath + forwardedPath,
				request,
			);
			const verified = defineSandboxProxy(async (sanitized, meta) => {
				if (
					request.signal.aborted ||
					claims.exp <= Math.floor(Date.now() / 1000) ||
					meta.host !== endpoint.host ||
					meta.teamId !== config.teamId ||
					meta.projectId !== config.projectId ||
					meta.sandboxId !== claims.sandbox_id ||
					meta.sandboxName !== claims.sandbox_name
				)
					return forbidden();
				try {
					return await handler(
						new Request(sanitized, { signal: request.signal }),
						{
							teamId: meta.teamId,
							projectId: meta.projectId,
							sandboxId: meta.sandboxId,
							sandboxName: meta.sandboxName,
						},
						raw,
					);
				} catch {
					return new Response("GitLab request failed", { status: 502 });
				}
			}, forbidden);
			let onAbort!: () => void;
			const aborted = new Promise<Response>((resolve) => {
				onAbort = () => resolve(forbidden());
				request.signal.addEventListener("abort", onAbort, { once: true });
				if (request.signal.aborted) onAbort();
			});
			try {
				return await Promise.race([verified(verificationRequest), aborted]);
			} finally {
				request.signal.removeEventListener("abort", onAbort);
			}
		} catch {
			return forbidden();
		}
	};
}
