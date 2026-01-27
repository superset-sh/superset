import { db } from "@superset/db/client";
import { members, verifications } from "@superset/db/schema/auth";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

/**
 * Custom endpoint to add organization scope to OAuth consent flow.
 *
 * Better Auth's consent endpoint doesn't accept scope in the body,
 * so we update the verification value directly before consent is processed.
 */
export const oauthOrgScopeEndpoint = {
	id: "oauth-org-scope",
	endpoints: {
		addOrgScope: createAuthEndpoint(
			"/oauth/add-org-scope",
			{
				method: "POST",
				body: z.object({
					consent_code: z.string(),
					organizationId: z.string().uuid(),
				}),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const { consent_code, organizationId } = ctx.body;
				const userId = ctx.context.session.user.id;

				// Verify user is a member of the organization
				const membership = await db.query.members.findFirst({
					where: and(
						eq(members.userId, userId),
						eq(members.organizationId, organizationId),
					),
				});

				if (!membership) {
					return ctx.json(
						{ error: "User is not a member of this organization" },
						{ status: 403 },
					);
				}

				// Find the verification value for this consent code
				const verification = await db.query.verifications.findFirst({
					where: eq(verifications.identifier, consent_code),
				});

				if (!verification) {
					return ctx.json({ error: "Invalid consent code" }, { status: 400 });
				}

				if (new Date() > new Date(verification.expiresAt)) {
					return ctx.json({ error: "Consent code expired" }, { status: 400 });
				}

				// Parse the stored value and add organization scope
				let value: { scope?: string | string[]; [key: string]: unknown };
				try {
					value = JSON.parse(verification.value);
				} catch {
					console.error(
						"[oauth-org-scope] Failed to parse verification value:",
						verification.value,
					);
					return ctx.json(
						{ error: "Invalid verification data" },
						{ status: 400 },
					);
				}
				const orgScope = `organization:${organizationId}`;

				// Ensure scope is an array
				const currentScopes = Array.isArray(value.scope)
					? value.scope
					: typeof value.scope === "string"
						? value.scope.split(" ")
						: [];

				// Add org scope if not already present
				if (!currentScopes.some((s: string) => s.startsWith("organization:"))) {
					currentScopes.push(orgScope);
				}

				// Update the verification value with the new scopes
				await db
					.update(verifications)
					.set({
						value: JSON.stringify({
							...value,
							scope: currentScopes,
						}),
					})
					.where(eq(verifications.id, verification.id));

				return ctx.json({ success: true });
			},
		),
	},
} satisfies BetterAuthPlugin;
