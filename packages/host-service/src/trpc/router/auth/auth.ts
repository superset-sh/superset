import { z } from "zod";
import { protectedProcedure, router } from "../../index";

const anthropicOAuthCodeInput = z.object({
	code: z.string().min(1),
});
const openAIOAuthCodeInput = z.object({
	code: z.string().optional(),
});
const anthropicApiKeyInput = z.object({
	apiKey: z.string().min(1),
});
const openAIApiKeyInput = z.object({
	apiKey: z.string().min(1),
});
const anthropicEnvConfigInput = z.object({
	envText: z.string(),
});

export const authRouter = router({
	getAnthropicStatus: protectedProcedure.query(({ ctx }) => {
		return ctx.runtime.auth.getAnthropicAuthStatus();
	}),
	startAnthropicOAuth: protectedProcedure.mutation(({ ctx }) => {
		return ctx.runtime.auth.startAnthropicOAuth();
	}),
	completeAnthropicOAuth: protectedProcedure
		.input(anthropicOAuthCodeInput)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.auth.completeAnthropicOAuth({ code: input.code });
		}),
	cancelAnthropicOAuth: protectedProcedure.mutation(({ ctx }) => {
		return ctx.runtime.auth.cancelAnthropicOAuth();
	}),
	disconnectAnthropicOAuth: protectedProcedure.mutation(({ ctx }) => {
		return ctx.runtime.auth.disconnectAnthropicOAuth();
	}),
	setAnthropicApiKey: protectedProcedure
		.input(anthropicApiKeyInput)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.auth.setAnthropicApiKey({ apiKey: input.apiKey });
		}),
	clearAnthropicApiKey: protectedProcedure.mutation(({ ctx }) => {
		return ctx.runtime.auth.clearAnthropicApiKey();
	}),
	getAnthropicEnvConfig: protectedProcedure.query(({ ctx }) => {
		return ctx.runtime.auth.getAnthropicEnvConfig();
	}),
	setAnthropicEnvConfig: protectedProcedure
		.input(anthropicEnvConfigInput)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.auth.setAnthropicEnvConfig({ envText: input.envText });
		}),
	clearAnthropicEnvConfig: protectedProcedure.mutation(({ ctx }) => {
		return ctx.runtime.auth.clearAnthropicEnvConfig();
	}),

	getOpenAIStatus: protectedProcedure.query(({ ctx }) => {
		return ctx.runtime.auth.getOpenAIAuthStatus();
	}),
	startOpenAIOAuth: protectedProcedure.mutation(({ ctx }) => {
		return ctx.runtime.auth.startOpenAIOAuth();
	}),
	completeOpenAIOAuth: protectedProcedure
		.input(openAIOAuthCodeInput)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.auth.completeOpenAIOAuth({ code: input.code });
		}),
	cancelOpenAIOAuth: protectedProcedure.mutation(({ ctx }) => {
		return ctx.runtime.auth.cancelOpenAIOAuth();
	}),
	disconnectOpenAIOAuth: protectedProcedure.mutation(({ ctx }) => {
		return ctx.runtime.auth.disconnectOpenAIOAuth();
	}),
	setOpenAIApiKey: protectedProcedure
		.input(openAIApiKeyInput)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.auth.setOpenAIApiKey({ apiKey: input.apiKey });
		}),
	clearOpenAIApiKey: protectedProcedure.mutation(({ ctx }) => {
		return ctx.runtime.auth.clearOpenAIApiKey();
	}),
});
