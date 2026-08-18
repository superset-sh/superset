import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import type { ChatService } from "../chat-service";

const t = initTRPC.create({ transformer: superjson });

export const anthropicOAuthCodeInput = z.object({
	code: z.string().min(1),
});

export const openAIOAuthCodeInput = z.object({
	code: z.string().optional(),
});

export const anthropicApiKeyInput = z.object({
	apiKey: z.string().min(1),
});

export const anthropicEnvConfigInput = z.object({
	envText: z.string(),
});

export const openAIApiKeyInput = z.object({
	apiKey: z.string().min(1),
});

export function createChatServiceRouter(service: ChatService) {
	return t.router({
		auth: t.router({
			getAnthropicStatus: t.procedure.query(() => {
				return service.getAnthropicAuthStatus();
			}),
			getOpenAIStatus: t.procedure.query(() => {
				return service.getOpenAIAuthStatus();
			}),
			startOpenAIOAuth: t.procedure.mutation(() => {
				return service.startOpenAIOAuth();
			}),
			completeOpenAIOAuth: t.procedure
				.input(openAIOAuthCodeInput)
				.mutation(async ({ input }) => {
					return service.completeOpenAIOAuth({ code: input.code });
				}),
			cancelOpenAIOAuth: t.procedure.mutation(() => {
				return service.cancelOpenAIOAuth();
			}),
			consumeOpenAIOAuthCallback: t.procedure.query(() => {
				return service.consumeOpenAIOAuthCallback();
			}),
			disconnectOpenAIOAuth: t.procedure.mutation(() => {
				return service.disconnectOpenAIOAuth();
			}),
			startAnthropicOAuth: t.procedure.mutation(() => {
				return service.startAnthropicOAuth();
			}),
			completeAnthropicOAuth: t.procedure
				.input(anthropicOAuthCodeInput)
				.mutation(async ({ input }) => {
					return service.completeAnthropicOAuth({ code: input.code });
				}),
			cancelAnthropicOAuth: t.procedure.mutation(() => {
				return service.cancelAnthropicOAuth();
			}),
			disconnectAnthropicOAuth: t.procedure.mutation(() => {
				return service.disconnectAnthropicOAuth();
			}),
			setAnthropicApiKey: t.procedure
				.input(anthropicApiKeyInput)
				.mutation(({ input }) => {
					return service.setAnthropicApiKey({ apiKey: input.apiKey });
				}),
			getAnthropicEnvConfig: t.procedure.query(() => {
				return service.getAnthropicEnvConfig();
			}),
			setAnthropicEnvConfig: t.procedure
				.input(anthropicEnvConfigInput)
				.mutation(({ input }) => {
					return service.setAnthropicEnvConfig({
						envText: input.envText,
					});
				}),
			clearAnthropicEnvConfig: t.procedure.mutation(() => {
				return service.clearAnthropicEnvConfig();
			}),
			clearAnthropicApiKey: t.procedure.mutation(() => {
				return service.clearAnthropicApiKey();
			}),
			setOpenAIApiKey: t.procedure
				.input(openAIApiKeyInput)
				.mutation(({ input }) => {
					return service.setOpenAIApiKey({ apiKey: input.apiKey });
				}),
			clearOpenAIApiKey: t.procedure.mutation(() => {
				return service.clearOpenAIApiKey();
			}),
		}),
	});
}

export type ChatServiceRouter = ReturnType<typeof createChatServiceRouter>;
