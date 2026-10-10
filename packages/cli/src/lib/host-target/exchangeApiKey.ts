import { CLIError } from "@superset/cli-framework";
import { z } from "zod";
import { env } from "../env";

const tokenResponse = z.object({ token: z.string().trim().min(1) });

function isApiKey(bearer: string): boolean {
	return bearer.startsWith("sk_live_") || bearer.startsWith("sk_test_");
}

export function createHostTokenProvider(
	bearer: string,
	now: () => number = Date.now,
): (signal?: AbortSignal) => Promise<string> {
	let cached: { token: string; expiresAt: number } | undefined;
	let pending: Promise<string> | undefined;
	return async (signal) => {
		if (!isApiKey(bearer)) return bearer;
		if (cached && now() < cached.expiresAt - 30_000) return cached.token;
		pending ??= exchangeApiKey(bearer, signal)
			.then((token) => {
				let expiresAt = 0;
				try {
					const payload: unknown = JSON.parse(
						Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
					);
					const parsed = z
						.object({ exp: z.number().finite() })
						.safeParse(payload);
					if (parsed.success) expiresAt = parsed.data.exp * 1000;
				} catch {}
				cached = { token, expiresAt };
				return token;
			})
			.finally(() => {
				pending = undefined;
			});
		return pending;
	};
}

export async function exchangeApiKey(
	bearer: string,
	signal?: AbortSignal,
): Promise<string> {
	if (!isApiKey(bearer)) return bearer;

	let response: Response;
	try {
		response = await fetch(`${env.SUPERSET_API_URL}/api/auth/token`, {
			headers: { "x-api-key": bearer },
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
				: AbortSignal.timeout(10_000),
			redirect: "error",
		});
	} catch {
		throw new CLIError(
			"Could not exchange API key for remote host access",
			"Check connectivity to the Superset API and try again",
		);
	}
	if (!response.ok) {
		throw new CLIError(
			`Could not exchange API key for remote host access (HTTP ${response.status})`,
			response.status === 401 || response.status === 403
				? "Check --api-key or SUPERSET_API_KEY"
				: "Check the Superset API and try again",
		);
	}

	let body: string;
	try {
		body = await response.text();
	} catch {
		throw new CLIError(
			"Could not exchange API key for remote host access",
			"Check connectivity to the Superset API and try again",
		);
	}
	let data: unknown;
	try {
		data = JSON.parse(body);
	} catch {
		throw new CLIError("Superset API returned an invalid remote host token");
	}
	const parsed = tokenResponse.safeParse(data);
	if (!parsed.success) {
		throw new CLIError("Superset API returned an invalid remote host token");
	}
	return parsed.data.token;
}
