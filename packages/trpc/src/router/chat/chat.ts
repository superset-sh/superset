import type { TRPCRouterRecord } from "@trpc/server";
import { protectedProcedure } from "../../trpc";

const AVAILABLE_MODELS = [
	{
		id: "anthropic/claude-opus-4-6",
		name: "Opus 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-sonnet-4-6",
		name: "Sonnet 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-haiku-4-5",
		name: "Haiku 4.5",
		provider: "Anthropic",
	},
	{
		id: "openai/gpt-4o",
		name: "GPT-4o",
		provider: "OpenAI",
	},
	{
		id: "openai/o3",
		name: "o3",
		provider: "OpenAI",
	},
	{
		id: "openai/gpt-5.2-codex",
		name: "GPT-5.2 Codex",
		provider: "OpenAI",
	},
];

export const chatRouter = {
	getModels: protectedProcedure.query(() => {
		return { models: AVAILABLE_MODELS };
	}),
} satisfies TRPCRouterRecord;
