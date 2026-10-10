import { db } from "@superset/db/client";
import { organizations } from "@superset/db/schema";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	realtimeToolDefinitions,
	VOICE_CONTEXT_TOKEN_LIMIT,
	VOICE_DEFAULT_REASONING_EFFORT,
	VOICE_DEFAULT_SPEED,
	VOICE_DEFAULT_VOICE,
	VOICE_MAX_SESSION_SECONDS,
	VOICE_REALTIME_MODEL,
	VOICE_SECRET_TTL_SECONDS,
	VOICE_TRANSCRIPTION_MODEL,
	voiceInstructions,
	voiceSessionSettingsSchema,
} from "@superset/shared/voice";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { env } from "../../env";
import { posthog } from "../../lib/analytics";
import {
	mintRealtimeClientSecret,
	RealtimeMintError,
} from "../../lib/openai/realtime";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

export const voiceRouter = {
	/**
	 * Mints the short-lived secret the phone connects to OpenAI with. The
	 * session (model, voice, instructions, tool schema) is fixed here, so the
	 * API key never leaves the server and the tool list cannot drift from
	 * what the device executes.
	 */
	createSession: protectedProcedure
		.input(voiceSessionSettingsSchema.optional())
		.mutation(async ({ ctx, input }) => {
			if (!env.SERVER_OPENAI_API_KEY) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Voice mode is not configured on this server.",
				});
			}
			// Undefined when PostHog cannot answer, which refuses: every session
			// spends on the shared OpenAI key.
			const organizationLookup = requireActiveOrgMembership(ctx).then(
				(organizationId) =>
					db.query.organizations.findFirst({
						where: eq(organizations.id, organizationId),
						columns: { name: true },
					}),
			);
			organizationLookup.catch(() => {});
			const enabled = await posthog.isFeatureEnabled(
				FEATURE_FLAGS.MOBILE_VOICE_MODE,
				ctx.session.user.id,
				{
					personProperties: { email: ctx.session.user.email.toLowerCase() },
					sendFeatureFlagEvents: false,
				},
			);
			if (!enabled) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Voice mode is not enabled for this account.",
				});
			}
			const organization = await organizationLookup;
			try {
				const secret = await mintRealtimeClientSecret({
					apiKey: env.SERVER_OPENAI_API_KEY,
					model: VOICE_REALTIME_MODEL,
					voice: input?.voice ?? VOICE_DEFAULT_VOICE,
					reasoningEffort:
						input?.reasoningEffort ?? VOICE_DEFAULT_REASONING_EFFORT,
					speed: input?.speed ?? VOICE_DEFAULT_SPEED,
					transcriptionModel: VOICE_TRANSCRIPTION_MODEL,
					ttlSeconds: VOICE_SECRET_TTL_SECONDS,
					contextTokenLimit: VOICE_CONTEXT_TOKEN_LIMIT,
					tools: realtimeToolDefinitions(),
					instructions: voiceInstructions({
						userName: ctx.session.user.name ?? null,
						organizationName: organization?.name ?? null,
					}),
					safetyIdentifier: ctx.session.user.id,
				});
				return {
					clientSecret: secret.value,
					expiresAt: secret.expiresAt,
					model: VOICE_REALTIME_MODEL,
					maxSessionSeconds: VOICE_MAX_SESSION_SECONDS,
				};
			} catch (error) {
				if (error instanceof RealtimeMintError) {
					throw new TRPCError({
						code: error.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY",
						message: "Could not start a voice session. Try again in a moment.",
						cause: error,
					});
				}
				throw error;
			}
		}),
} satisfies TRPCRouterRecord;
