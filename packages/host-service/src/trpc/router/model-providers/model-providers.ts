import { randomBytes, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	type ModelProviderProtocol,
	workspaceAgentModelConfigs,
	workspaces,
} from "../../../db/schema";
import {
	type ClaudeModelEnvKey,
	writeClaudeSettingsLocalJson,
} from "../../../model-providers/claude-settings";
import { encodeProviderModelRef } from "../../../model-providers/model-ref";
import { fetchRemoteModelList } from "../../../model-providers/remote-models";
import {
	deleteModelProvider,
	getModelProvider,
	listModelProviders,
	upsertModelProvider,
} from "../../../model-providers/storage";
import { protectedProcedure, queryProcedure, router } from "../../index";

const protocolSchema = z.enum(["anthropic", "openai-chat", "openai-responses"]);

const providerModelInputSchema = z.object({
	modelId: z.string().trim().min(1),
	displayName: z.string().trim().optional(),
	enabled: z.boolean().optional(),
	capabilities: z.record(z.string(), z.unknown()).optional(),
});

const upsertProviderSchema = z.object({
	id: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1),
	protocol: protocolSchema,
	baseUrl: z.url(),
	enabled: z.boolean().default(true),
	secret: z.string().optional(),
	models: z.array(providerModelInputSchema).min(1),
});

const fetchRemoteModelsSchema = z.object({
	id: z.string().trim().min(1).optional(),
	protocol: protocolSchema.optional(),
	baseUrl: z.url().optional(),
	secret: z.string().optional(),
});

const claudeConfigSchema = z.object({
	workspaceId: z.string().min(1),
	providerId: z.string().min(1),
	haikuModelId: z.string().trim().min(1),
	sonnetModelId: z.string().trim().min(1),
	opusModelId: z.string().trim().min(1),
	disableOneMillionContext: z.boolean().default(true),
});

function randomGatewayToken(): string {
	return `superset_${randomBytes(24).toString("base64url")}`;
}

function assertProviderModels(args: {
	provider: NonNullable<ReturnType<typeof getModelProvider>>;
	modelIds: string[];
}): void {
	const available = new Set(
		args.provider.models
			.filter((model) => model.enabled)
			.map((model) => model.modelId),
	);
	const missing = args.modelIds.filter((modelId) => !available.has(modelId));
	if (missing.length > 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Model is not configured for provider: ${missing.join(", ")}`,
		});
	}
}

function claudeEnv(args: {
	gatewayToken: string;
	gatewayBaseUrl: string;
	haikuModelId: string;
	sonnetModelId: string;
	opusModelId: string;
	disableOneMillionContext: boolean;
}): Record<ClaudeModelEnvKey, string> {
	return {
		ANTHROPIC_AUTH_TOKEN: args.gatewayToken,
		ANTHROPIC_BASE_URL: args.gatewayBaseUrl,
		API_TIMEOUT_MS: "3000000",
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
		ANTHROPIC_DEFAULT_HAIKU_MODEL: args.haikuModelId,
		ANTHROPIC_DEFAULT_SONNET_MODEL: args.sonnetModelId,
		ANTHROPIC_DEFAULT_OPUS_MODEL: args.opusModelId,
		CLAUDE_CODE_DISABLE_1M_CONTEXT: args.disableOneMillionContext ? "1" : "0",
	};
}

export const modelProvidersRouter = router({
	list: queryProcedure.query(({ ctx }) => listModelProviders(ctx.db)),

	listChatModels: queryProcedure.query(({ ctx }) =>
		listModelProviders(ctx.db)
			.filter((provider) => provider.enabled && provider.hasSecret)
			.flatMap((provider) =>
				provider.models
					.filter((model) => model.enabled)
					.map((model) => ({
						id: encodeProviderModelRef({
							providerId: provider.id,
							modelId: model.modelId,
						}),
						name: model.displayName,
						provider: provider.name,
						providerId: provider.id,
						protocol: provider.protocol,
						modelId: model.modelId,
					})),
			),
	),

	upsert: protectedProcedure
		.input(upsertProviderSchema)
		.mutation(({ ctx, input }) =>
			upsertModelProvider(ctx.db, {
				...input,
				protocol: input.protocol as ModelProviderProtocol,
			}),
		),

	fetchRemoteModels: protectedProcedure
		.input(fetchRemoteModelsSchema)
		.mutation(async ({ ctx, input }) => {
			const provider = input.id ? getModelProvider(ctx.db, input.id) : null;
			if (input.id && !provider) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Provider ${input.id} not found`,
				});
			}

			const protocol = input.protocol ?? provider?.protocol;
			const baseUrl = input.baseUrl?.trim() || provider?.baseUrl;
			const secret = input.secret?.trim() || provider?.secret;
			if (!protocol || !baseUrl) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provider protocol and base URL are required",
				});
			}
			if (!secret) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provider credential is required",
				});
			}

			try {
				return {
					models: await fetchRemoteModelList({ protocol, baseUrl, secret }),
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Failed to fetch remote model list",
				});
			}
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(({ ctx, input }) => deleteModelProvider(ctx.db, input.id)),

	getWorkspaceClaudeConfig: queryProcedure
		.input(z.object({ workspaceId: z.string().min(1) }))
		.query(({ ctx, input }) => {
			const row = ctx.db
				.select()
				.from(workspaceAgentModelConfigs)
				.where(
					and(
						eq(workspaceAgentModelConfigs.workspaceId, input.workspaceId),
						eq(workspaceAgentModelConfigs.agent, "claude"),
					),
				)
				.get();
			if (!row) return null;
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			return {
				workspaceId: row.workspaceId,
				providerId: row.providerId,
				haikuModelId: row.haikuModelId,
				sonnetModelId: row.sonnetModelId,
				opusModelId: row.opusModelId,
				disableOneMillionContext: row.disableOneMillionContext,
				gatewayBaseUrl: `${ctx.hostServiceBaseUrl}/model-gateway`,
				settingsPath: workspace?.worktreePath
					? `${workspace.worktreePath}/.claude/settings.local.json`
					: null,
			};
		}),

	saveWorkspaceClaudeConfig: protectedProcedure
		.input(claudeConfigSchema)
		.mutation(({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Workspace ${input.workspaceId} not found`,
				});
			}
			const provider = getModelProvider(ctx.db, input.providerId);
			if (!provider) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Provider ${input.providerId} not found`,
				});
			}
			if (!provider.enabled) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provider is disabled",
				});
			}
			if (!provider.hasSecret) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provider credential is required",
				});
			}
			assertProviderModels({
				provider,
				modelIds: [input.haikuModelId, input.sonnetModelId, input.opusModelId],
			});

			const existing = ctx.db
				.select()
				.from(workspaceAgentModelConfigs)
				.where(
					and(
						eq(workspaceAgentModelConfigs.workspaceId, input.workspaceId),
						eq(workspaceAgentModelConfigs.agent, "claude"),
					),
				)
				.get();
			const gatewayToken = existing?.gatewayToken ?? randomGatewayToken();
			const now = Date.now();
			const id = existing?.id ?? randomUUID();
			ctx.db
				.insert(workspaceAgentModelConfigs)
				.values({
					id,
					workspaceId: input.workspaceId,
					agent: "claude",
					providerId: input.providerId,
					gatewayToken,
					haikuModelId: input.haikuModelId,
					sonnetModelId: input.sonnetModelId,
					opusModelId: input.opusModelId,
					disableOneMillionContext: input.disableOneMillionContext,
					createdAt: existing?.createdAt ?? now,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: [
						workspaceAgentModelConfigs.workspaceId,
						workspaceAgentModelConfigs.agent,
					],
					set: {
						providerId: input.providerId,
						gatewayToken,
						haikuModelId: input.haikuModelId,
						sonnetModelId: input.sonnetModelId,
						opusModelId: input.opusModelId,
						disableOneMillionContext: input.disableOneMillionContext,
						updatedAt: now,
					},
				})
				.run();

			const gatewayBaseUrl = `${ctx.hostServiceBaseUrl}/model-gateway`;
			const writeResult = writeClaudeSettingsLocalJson({
				worktreePath: workspace.worktreePath,
				env: claudeEnv({
					gatewayToken,
					gatewayBaseUrl,
					haikuModelId: input.haikuModelId,
					sonnetModelId: input.sonnetModelId,
					opusModelId: input.opusModelId,
					disableOneMillionContext: input.disableOneMillionContext,
				}),
			});
			return {
				...writeResult,
				providerId: input.providerId,
				gatewayBaseUrl,
			};
		}),

	gatewayStatus: queryProcedure.query(({ ctx }) => {
		const providers = listModelProviders(ctx.db);
		return {
			baseUrl: `${ctx.hostServiceBaseUrl}/model-gateway`,
			enabledProviderCount: providers.filter(
				(provider) => provider.enabled && provider.hasSecret,
			).length,
			enabledModelCount: providers.reduce(
				(total, provider) =>
					total +
					(provider.enabled
						? provider.models.filter((model) => model.enabled).length
						: 0),
				0,
			),
		};
	}),
});
