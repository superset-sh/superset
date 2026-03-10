import {
	clearProviderIssue,
	getProviderDiagnostic,
} from "lib/ai/provider-diagnostics";
import {
	deriveModelProviderStatus,
	type ProviderId,
} from "shared/ai/provider-status";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { chatService } from "../chat-service";

const providerIdSchema = z.enum(["anthropic", "openai"]);

async function getProviderStatuses() {
	const [anthropicAuthStatus, openAIAuthStatus] = await Promise.all([
		chatService.getAnthropicAuthStatus(),
		chatService.getOpenAIAuthStatus(),
	]);

	return [
		deriveModelProviderStatus({
			providerId: "anthropic",
			authStatus: anthropicAuthStatus,
			diagnostic: getProviderDiagnostic("anthropic"),
		}),
		deriveModelProviderStatus({
			providerId: "openai",
			authStatus: openAIAuthStatus,
			diagnostic: getProviderDiagnostic("openai"),
		}),
	];
}

export const createModelProvidersRouter = () => {
	return router({
		getStatuses: publicProcedure.query(async () => {
			return getProviderStatuses();
		}),
		clearIssue: publicProcedure
			.input(z.object({ providerId: providerIdSchema }))
			.mutation(({ input }: { input: { providerId: ProviderId } }) => {
				clearProviderIssue(input.providerId);
				return { success: true };
			}),
	});
};

export type ModelProvidersRouter = ReturnType<
	typeof createModelProvidersRouter
>;
