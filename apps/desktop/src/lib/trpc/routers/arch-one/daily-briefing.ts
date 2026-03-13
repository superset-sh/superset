import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
	getCredentialsFromAnySource as getAnthropicCredentialsFromAnySource,
	getAnthropicProviderOptions,
	getOpenAICredentialsFromAnySource,
} from "@superset/chat/host";
import { generateText } from "ai";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const briefingCache = new Map<
	string,
	{ summary: string; generatedAt: number }
>();

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const activityDataSchema = z.object({
	completedTasks: z.array(
		z.object({ slug: z.string(), title: z.string(), completedBy: z.string() }),
	),
	startedTasks: z.array(
		z.object({ slug: z.string(), title: z.string(), assignee: z.string() }),
	),
	newTasks: z.array(z.object({ slug: z.string(), title: z.string() })),
	mergedPRs: z.array(
		z.object({
			prNumber: z.number(),
			title: z.string(),
			authorLogin: z.string(),
		}),
	),
	openedPRs: z.array(
		z.object({
			prNumber: z.number(),
			title: z.string(),
			authorLogin: z.string(),
			isDraft: z.boolean(),
		}),
	),
	staleTasks: z.array(
		z.object({
			slug: z.string(),
			title: z.string(),
			assignee: z.string(),
			daysSinceUpdate: z.number(),
		}),
	),
	teamOpenPRs: z.array(
		z.object({
			prNumber: z.number(),
			title: z.string(),
			authorLogin: z.string(),
			isDraft: z.boolean(),
			reviewDecision: z.string().nullable(),
			checksStatus: z.string(),
			additions: z.number(),
			deletions: z.number(),
			createdAt: z.string(),
		}),
	),
});

function getCacheKey(): string {
	const now = new Date();
	return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

async function callLLM(prompt: string): Promise<string | null> {
	// Try Anthropic first, then OpenAI
	const anthropicCreds = getAnthropicCredentialsFromAnySource();
	if (anthropicCreds) {
		try {
			const anthropic = createAnthropic(
				getAnthropicProviderOptions(anthropicCreds),
			);
			const result = await generateText({
				model: anthropic("claude-haiku-4-5-20251001"),
				prompt,
				maxOutputTokens: 500,
			});
			if (result.text) return result.text;
		} catch (error) {
			console.error("[daily-briefing] Anthropic generation failed", error);
		}
	}

	const openaiCreds = getOpenAICredentialsFromAnySource();
	if (openaiCreds) {
		try {
			const openai = createOpenAI({ apiKey: openaiCreds.apiKey });
			const result = await generateText({
				model: openai("gpt-4o-mini"),
				prompt,
				maxOutputTokens: 500,
			});
			if (result.text) return result.text;
		} catch (error) {
			console.error("[daily-briefing] OpenAI generation failed", error);
		}
	}

	return null;
}

export const createDailyBriefingRouter = () => {
	return router({
		generateBriefing: publicProcedure
			.input(z.object({ activityData: activityDataSchema }))
			.mutation(async ({ input }) => {
				const { activityData } = input;

				const sections: string[] = [];
				if (activityData.completedTasks.length > 0) {
					sections.push(
						`Completed tasks (${activityData.completedTasks.length}):\n${activityData.completedTasks.map((t) => `- ${t.slug}: ${t.title} (by ${t.completedBy})`).join("\n")}`,
					);
				}
				if (activityData.startedTasks.length > 0) {
					sections.push(
						`Started tasks (${activityData.startedTasks.length}):\n${activityData.startedTasks.map((t) => `- ${t.slug}: ${t.title} (${t.assignee})`).join("\n")}`,
					);
				}
				if (activityData.newTasks.length > 0) {
					sections.push(
						`New tasks (${activityData.newTasks.length}):\n${activityData.newTasks.map((t) => `- ${t.slug}: ${t.title}`).join("\n")}`,
					);
				}
				if (activityData.mergedPRs.length > 0) {
					sections.push(
						`Merged PRs (${activityData.mergedPRs.length}):\n${activityData.mergedPRs.map((p) => `- #${p.prNumber}: ${p.title} (by ${p.authorLogin})`).join("\n")}`,
					);
				}
				if (activityData.openedPRs.length > 0) {
					sections.push(
						`Opened PRs (${activityData.openedPRs.length}):\n${activityData.openedPRs.map((p) => `- #${p.prNumber}: ${p.title} (by ${p.authorLogin})${p.isDraft ? " [draft]" : ""}`).join("\n")}`,
					);
				}
				if (activityData.staleTasks.length > 0) {
					sections.push(
						`Stale/blocked tasks:\n${activityData.staleTasks.map((t) => `- ${t.slug}: ${t.title} (${t.assignee}, ${t.daysSinceUpdate}d since update)`).join("\n")}`,
					);
				}
				if (activityData.teamOpenPRs.length > 0) {
					sections.push(
						`Currently open PRs — what teammates are working on (${activityData.teamOpenPRs.length}):\n${activityData.teamOpenPRs
							.map((p) => {
								const status = p.isDraft
									? "draft"
									: p.reviewDecision === "APPROVED"
										? "approved"
										: p.reviewDecision === "CHANGES_REQUESTED"
											? "changes requested"
											: "awaiting review";
								const ci =
									p.checksStatus === "failure"
										? ", CI failing"
										: p.checksStatus === "pending"
											? ", CI pending"
											: "";
								return `- #${p.prNumber}: ${p.title} (by ${p.authorLogin}, ${status}${ci}, +${p.additions}/-${p.deletions})`;
							})
							.join("\n")}`,
					);
				}

				if (sections.length === 0) {
					return {
						summary: "No recent activity to summarize.",
						generatedAt: Date.now(),
					};
				}

				const prompt = `You are a concise engineering team assistant. Summarize this team activity for a developer starting their day. Use 3-5 bullet points in markdown. Highlight anything blocked or noteworthy. Include a brief note on what teammates are currently working on based on open PRs. Be brief and actionable.

Recent team activity:

${sections.join("\n\n")}`;

				const summary = await callLLM(prompt);
				if (!summary) {
					return {
						summary:
							"Could not generate briefing. Check that AI credentials are configured.",
						generatedAt: Date.now(),
					};
				}

				const result = { summary, generatedAt: Date.now() };
				briefingCache.set(getCacheKey(), result);
				return result;
			}),

		getBriefing: publicProcedure.query(() => {
			const cached = briefingCache.get(getCacheKey());
			if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
				return cached;
			}
			return null;
		}),
	});
};
