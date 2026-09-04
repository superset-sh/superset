import { db, dbWs } from "@superset/db/client";
import {
	agentCredentialKindValues,
	agentCredentials,
} from "@superset/db/schema";
import { agentCredentialToEnv } from "@superset/shared/agent-credentials";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { jwtProcedure, userError } from "../../trpc";
import { decryptAgentCredential, encryptAgentCredential } from "./utils/crypto";
import { validateAgentCredential } from "./utils/validate";

const agentId = z.string().min(1).max(64);

export const agentCredentialRouter = {
	/** What settings shows: which agents are signed in, never the credential. */
	list: jwtProcedure.query(async ({ ctx }) => {
		const rows = await db
			.select({
				agent: agentCredentials.agent,
				kind: agentCredentials.kind,
				baseUrl: agentCredentials.baseUrl,
				accountLabel: agentCredentials.accountLabel,
				lastValidatedAt: agentCredentials.lastValidatedAt,
				updatedAt: agentCredentials.updatedAt,
			})
			.from(agentCredentials)
			.where(eq(agentCredentials.userId, ctx.userId))
			.orderBy(asc(agentCredentials.agent));
		return rows;
	}),

	set: jwtProcedure
		.input(
			z.object({
				agent: agentId,
				kind: z.enum(agentCredentialKindValues),
				value: z.string().min(1).max(8192),
				baseUrl: z.string().url().max(2048).optional(),
				accountLabel: z.string().max(200).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const value = input.value.trim();
			if (!value) {
				throw userError({
					code: "BAD_REQUEST",
					message: "Enter a value.",
					i18nKey: "serverError.agentCredential.empty",
				});
			}
			if (!Object.keys(agentCredentialToEnv({ ...input, value })).length) {
				throw userError({
					code: "BAD_REQUEST",
					message: `${input.agent} cannot be signed in this way yet.`,
					i18nKey: "serverError.agentCredential.unsupported",
					params: { agent: input.agent },
				});
			}

			const check = await validateAgentCredential({
				agent: input.agent,
				kind: input.kind,
				value,
				baseUrl: input.baseUrl,
			});
			if (!check.ok) {
				throw userError({
					code: "BAD_REQUEST",
					message: check.message ?? "The provider refused it.",
					i18nKey:
						check.i18nKey ?? "serverError.agentCredential.providerUnreachable",
					...(check.params ? { params: check.params } : {}),
				});
			}

			const encryptedValue = encryptAgentCredential(value, {
				userId: ctx.userId,
				agent: input.agent,
			});
			const row = {
				userId: ctx.userId,
				agent: input.agent,
				kind: input.kind,
				encryptedValue,
				baseUrl: input.baseUrl ?? null,
				accountLabel: input.accountLabel ?? null,
				lastValidatedAt: new Date(),
			};
			await dbWs
				.insert(agentCredentials)
				.values(row)
				.onConflictDoUpdate({
					target: [agentCredentials.userId, agentCredentials.agent],
					set: {
						kind: row.kind,
						encryptedValue: row.encryptedValue,
						baseUrl: row.baseUrl,
						accountLabel: row.accountLabel,
						lastValidatedAt: row.lastValidatedAt,
					},
				});
			return { agent: input.agent, kind: input.kind };
		}),

	remove: jwtProcedure
		.input(z.object({ agent: agentId }))
		.mutation(async ({ ctx, input }) => {
			await dbWs
				.delete(agentCredentials)
				.where(
					and(
						eq(agentCredentials.userId, ctx.userId),
						eq(agentCredentials.agent, input.agent),
					),
				);
			return { agent: input.agent };
		}),
} satisfies TRPCRouterRecord;

/**
 * The env a person's signed-in agent contributes to a cloud workspace they
 * start. Server-side only: the plaintext never leaves this process except on
 * the sandbox it was fetched for.
 */
export async function resolveAgentCredentialEnv(args: {
	userId: string;
	agent: string | null | undefined;
}): Promise<Record<string, string>> {
	if (!args.agent) return {};
	const [row] = await db
		.select()
		.from(agentCredentials)
		.where(
			and(
				eq(agentCredentials.userId, args.userId),
				eq(agentCredentials.agent, args.agent),
			),
		)
		.limit(1);
	if (!row) return {};
	const value = decryptAgentCredential(row.encryptedValue, {
		userId: row.userId,
		agent: row.agent,
	});
	return agentCredentialToEnv({
		agent: row.agent,
		kind: row.kind,
		value,
		baseUrl: row.baseUrl,
	});
}
