import { isIP } from "node:net";
import type { GitlabSandboxProxyConfig } from "./sandbox-proxy";

function endpoint(value: string | undefined): string | null {
	if (
		!value ||
		value.length > 2048 ||
		!/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:\/[A-Za-z0-9_./-]*)?$/i.test(
			value,
		) ||
		value.split("/").some((part) => part === "." || part === "..")
	)
		return null;
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:" ||
			url.port ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			isIP(url.hostname) ||
			url.hostname.length > 253 ||
			!url.hostname
				.split(".")
				.every((label) =>
					/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
				) ||
			url.pathname.includes("//")
		)
			return null;
		return url.origin + url.pathname.replace(/\/+$/, "");
	} catch {
		return null;
	}
}

export function resolveGitlabSandboxForwardURL(settings: {
	proxyURL?: string;
	apiURL?: string;
}): string | null {
	if (settings.proxyURL !== undefined && settings.proxyURL !== "")
		return endpoint(settings.proxyURL);
	const origin = endpoint(settings.apiURL);
	if (!origin || new URL(origin).pathname !== "/") return null;
	return `${origin}/api/gitlab/proxy`;
}

export function resolveGitlabSandboxProxyConfig(
	settings: Record<string, string | undefined>,
): GitlabSandboxProxyConfig | null {
	const issuer = settings.GITLAB_SANDBOX_OIDC_ISSUER;
	const token = settings.VERCEL_SANDBOX_TOKEN;
	const teamId = settings.VERCEL_SANDBOX_TEAM_ID;
	const projectId = settings.VERCEL_SANDBOX_PROJECT_ID;
	if (
		!issuer ||
		!/^https:\/\/oidc\.vercel\.com\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
			issuer,
		) ||
		!token ||
		token.length > 16384 ||
		/\s/.test(token) ||
		Array.from(token).some(
			(character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
		) ||
		!teamId ||
		!projectId ||
		![teamId, projectId].every((value) =>
			/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(value),
		)
	)
		return null;
	const forwardURL = resolveGitlabSandboxForwardURL({
		proxyURL: settings.GITLAB_SANDBOX_PROXY_URL,
		apiURL: settings.NEXT_PUBLIC_API_URL,
	});
	return forwardURL ? { issuer, forwardURL, teamId, projectId } : null;
}
