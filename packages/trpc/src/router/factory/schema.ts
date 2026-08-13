import { factoryItemSourceEnum, factoryStageEnum } from "@superset/db/schema";
import { z } from "zod";
import { AGENT_STAGES } from "./stages";

export const agentStageEnum = z.enum(AGENT_STAGES);

export const stageConfigSchema = z.partialRecord(
	agentStageEnum,
	z.object({
		agent: z.string().min(1).optional(),
		model: z.string().min(1).optional(),
	}),
);

export const createFactorySchema = z.object({
	name: z.string().trim().min(1).max(100),
	v2ProjectId: z.string().uuid(),
	repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo"),
	targetHostId: z.string().min(1).optional(),
	defaultAgent: z.string().min(1),
	stageConfig: stageConfigSchema.optional(),
	autoAdvance: z.boolean().optional(),
});

export const updateFactorySchema = z.object({
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(100).optional(),
	targetHostId: z.string().min(1).nullable().optional(),
	repoFullName: z
		.string()
		.regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo")
		.optional(),
	defaultAgent: z.string().min(1).optional(),
	stageConfig: stageConfigSchema.optional(),
	enabled: z.boolean().optional(),
	autoAdvance: z.boolean().optional(),
});

export const intakeSchema = z.object({
	factoryId: z.string().uuid(),
	issues: z
		.array(
			z.object({
				source: factoryItemSourceEnum.default("github_issue"),
				number: z.number().int().positive(),
				title: z.string().min(1).max(500),
				url: z.string().url(),
				authorLogin: z.string().optional(),
			}),
		)
		.min(1)
		.max(50),
});

export const runStageSchema = z.object({
	itemId: z.string().uuid(),
	/** Omitted = the item's next dispatchable stage (retry current, or advance). */
	stage: agentStageEnum.optional(),
	expectedRevision: z.number().int().nonnegative(),
});

export const reportRunSchema = z.object({
	runId: z.string().uuid(),
	itemId: z.string().uuid().optional(),
	expectedRevision: z.number().int().nonnegative(),
	outcome: z.enum(["success", "blocked"]),
	result: z.unknown().optional(),
	rationale: z.string().min(1).max(4000),
});

export const transitionItemSchema = z.object({
	itemId: z.string().uuid(),
	expectedRevision: z.number().int().nonnegative(),
	toStage: factoryStageEnum,
	note: z.string().max(2000).optional(),
});

export const setRunFeedbackSchema = z.object({
	runId: z.string().uuid(),
	outcome: z.enum(["success", "flawed"]),
	feedbackNote: z.string().max(4000).optional(),
});

export const setStagePromptSchema = z.object({
	factoryId: z.string().uuid(),
	stage: agentStageEnum,
	content: z.string().min(1).max(20_000),
});
