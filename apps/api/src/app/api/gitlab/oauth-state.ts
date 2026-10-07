import {
	decryptSecret,
	encryptSecret,
} from "@superset/trpc/integrations/plugins";
import { gitlabAccountIdentity } from "@superset/trpc/lib/gitlab/scope";
import { parseGitLabOrigin } from "@superset/trpc/lib/gitlab/ssrf";
import { z } from "zod";
import { beginOAuthFlow, STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { verifySignedState } from "@/lib/oauth-state";
import { buildAuthorizeUrl, createPkcePair } from "./oauth";

const pendingSchema = z.object({
	provider: z.literal("gitlab"),
	host: z.string(),
	groupPath: z.string().min(1),
	verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
const stateSchema = z.object({
	organizationId: z.string().min(1),
	userId: z.string().min(1),
	pending: z.string().min(1),
	timestamp: z.number(),
});

export async function beginGitlabOAuthFlow(options: {
	organizationId: string;
	userId: string;
	origin: string;
	groupPath: string;
	clientId: string;
	redirectUri: string;
	issuer?: string;
}): Promise<Response> {
	const host = parseGitLabOrigin(options.origin).host;
	gitlabAccountIdentity(host, "group", options.groupPath);
	const pkce = createPkcePair();
	const pending = await encryptSecret(
		JSON.stringify({
			provider: "gitlab",
			host,
			groupPath: options.groupPath,
			verifier: pkce.verifier,
		}),
	);
	return beginOAuthFlow({
		cookie: STATE_COOKIES.gitlab,
		payload: {
			organizationId: options.organizationId,
			userId: options.userId,
			pending,
		},
		authorizeUrl: (state) =>
			buildAuthorizeUrl({ ...options, state, challenge: pkce.challenge }),
	});
}

export async function resolveGitlabOAuthCallback(
	request: Request,
	redirect: (error: string) => string,
) {
	const callback = await resolveCallback(request, {
		params: ["code"],
		redirect,
		cookie: STATE_COOKIES.gitlab,
		requireAdmin: true,
	});
	if (callback instanceof Response) return callback;
	const state = verifySignedState(callback.state, stateSchema);
	if (!state) return callback.fail("invalid_state");
	try {
		const pending = pendingSchema.parse(
			JSON.parse(await decryptSecret(state.pending)),
		);
		pending.host = parseGitLabOrigin(pending.host).host;
		gitlabAccountIdentity(pending.host, "group", pending.groupPath);
		return { ...callback, pending };
	} catch {
		return callback.fail("invalid_state");
	}
}
