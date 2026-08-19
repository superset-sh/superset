import { NOTION_VERSION } from "@superset/trpc/integrations/notion";
import { z } from "zod";

import { env } from "@/env";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { upsertConnection } from "@/lib/integrations/upsertConnection";
import { upsertIdentity } from "@/lib/integrations/upsertIdentity";

/**
 * What Notion returns for an authorization code. `owner` is the person who
 * clicked through — the only Notion identity the connection can vouch for.
 */
const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().nullish(),
	bot_id: z.string(),
	workspace_id: z.string().min(1),
	workspace_name: z.string().nullish(),
	owner: z.object({
		type: z.string(),
		user: z
			.object({
				id: z.string().min(1),
				name: z.string().nullish(),
			})
			.optional(),
	}),
});

const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/notion`;

export async function GET(request: Request) {
	if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) {
		return Response.redirect(`${settingsUrl}?error=not_configured`);
	}

	const callback = await resolveCallback(request, {
		params: ["code"],
		redirect: (error) => Response.redirect(`${settingsUrl}?error=${error}`),
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params } = callback;

	const basic = Buffer.from(
		`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`,
	).toString("base64");
	const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${basic}`,
			"Content-Type": "application/json",
			"Notion-Version": NOTION_VERSION,
		},
		body: JSON.stringify({
			grant_type: "authorization_code",
			code: params.code,
			redirect_uri: `${env.NEXT_PUBLIC_API_URL}/api/integrations/notion/callback`,
		}),
		signal: AbortSignal.timeout(15_000),
	}).catch((error: unknown) => {
		console.error("[notion/callback] Token exchange request failed:", error);
		return null;
	});
	if (!tokenResponse?.ok) {
		if (tokenResponse) {
			console.error(
				"[notion/callback] Token exchange failed:",
				tokenResponse.status,
				await tokenResponse.text().catch(() => ""),
			);
		}
		return Response.redirect(`${settingsUrl}?error=token_exchange_failed`);
	}

	const parsed = tokenResponseSchema.safeParse(await tokenResponse.json());
	if (!parsed.success) {
		console.error("[notion/callback] Unexpected token response:", parsed.error);
		return Response.redirect(`${settingsUrl}?error=token_exchange_failed`);
	}
	const token = parsed.data;

	const result = await upsertConnection({
		organizationId,
		userId,
		provider: "notion",
		accessToken: token.access_token,
		refreshToken: token.refresh_token ?? null,
		externalOrgId: token.workspace_id,
		externalOrgName: token.workspace_name ?? null,
	});
	if (result.conflict) {
		return Response.redirect(`${settingsUrl}?error=workspace_already_linked`);
	}

	// The authorizing member's Notion user id, so `me` in a mention trigger
	// resolves for them. Notion user ids are per workspace, hence the scope.
	if (token.owner.user) {
		await upsertIdentity({
			userId,
			organizationId,
			provider: "notion",
			externalId: token.owner.user.id,
			externalScopeId: token.workspace_id,
			displayName: token.owner.user.name ?? null,
		});
	}

	return Response.redirect(settingsUrl);
}
