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
	getAnthropicStatus: protectedProcedure.query(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.getAnthropicAuthStatus();
	}),
	startAnthropicOAuth: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.startAnthropicOAuth();
	}),
	completeAnthropicOAuth: protectedProcedure
		.input(anthropicOAuthCodeInput)
		.mutation(async ({ ctx, input }) => {
			const auth = await ctx.runtime.getAuth();
			return auth.completeAnthropicOAuth({ code: input.code });
		}),
	cancelAnthropicOAuth: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.cancelAnthropicOAuth();
	}),
	disconnectAnthropicOAuth: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.disconnectAnthropicOAuth();
	}),
	setAnthropicApiKey: protectedProcedure
		.input(anthropicApiKeyInput)
		.mutation(async ({ ctx, input }) => {
			const auth = await ctx.runtime.getAuth();
			return auth.setAnthropicApiKey({ apiKey: input.apiKey });
		}),
	clearAnthropicApiKey: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.clearAnthropicApiKey();
	}),
	getAnthropicEnvConfig: protectedProcedure.query(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.getAnthropicEnvConfig();
	}),
	setAnthropicEnvConfig: protectedProcedure
		.input(anthropicEnvConfigInput)
		.mutation(async ({ ctx, input }) => {
			const auth = await ctx.runtime.getAuth();
			return auth.setAnthropicEnvConfig({ envText: input.envText });
		}),
	clearAnthropicEnvConfig: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.clearAnthropicEnvConfig();
	}),

	getOpenAIStatus: protectedProcedure.query(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.getOpenAIAuthStatus();
	}),
	startOpenAIOAuth: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.startOpenAIOAuth();
	}),
	completeOpenAIOAuth: protectedProcedure
		.input(openAIOAuthCodeInput)
		.mutation(async ({ ctx, input }) => {
			const auth = await ctx.runtime.getAuth();
			return auth.completeOpenAIOAuth({ code: input.code });
		}),
	cancelOpenAIOAuth: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.cancelOpenAIOAuth();
	}),
	disconnectOpenAIOAuth: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.disconnectOpenAIOAuth();
	}),
	setOpenAIApiKey: protectedProcedure
		.input(openAIApiKeyInput)
		.mutation(async ({ ctx, input }) => {
			const auth = await ctx.runtime.getAuth();
			return auth.setOpenAIApiKey({ apiKey: input.apiKey });
		}),
	clearOpenAIApiKey: protectedProcedure.mutation(async ({ ctx }) => {
		const auth = await ctx.runtime.getAuth();
		return auth.clearOpenAIApiKey();
	}),
});
