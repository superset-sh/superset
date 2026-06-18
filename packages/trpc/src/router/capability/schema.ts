import {
	capabilityPackageAuditStatusValues,
	capabilityPackageSourceTypeValues,
	capabilityPackageTypeValues,
} from "@superset/db/enums";
import { z } from "zod";

const slugSchema = z
	.string()
	.trim()
	.min(2)
	.max(80)
	.regex(
		/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
		"Use lowercase letters, numbers, and hyphens.",
	);

const semverLikeSchema = z
	.string()
	.trim()
	.min(1)
	.max(80)
	.regex(
		/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/,
		"Use a semver-like version such as 1.0.0.",
	);

const safeRelativePathSchema = z.string().trim().min(1).max(500);

const displayStringSchema = z.string().trim().min(1).max(160);

const capabilityDisplaySchema = z
	.object({
		summary: z.string().trim().min(1).max(500).optional(),
		overviewMarkdown: z.string().trim().min(1).max(40_000).optional(),
		intendedUsers: z.array(displayStringSchema).max(20).default([]),
		useCases: z.array(displayStringSchema).max(30).default([]),
	})
	.strict()
	.default({ intendedUsers: [], useCases: [] });

const commonManifestFields = {
	manifestVersion: z.literal(1),
	id: slugSchema,
	type: z.enum(capabilityPackageTypeValues),
	name: z.string().trim().min(1).max(120),
	version: semverLikeSchema,
	description: z.string().trim().max(2000).optional(),
	entry: safeRelativePathSchema,
	keywords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
	author: z.string().trim().max(120).optional(),
	homepage: z.url().optional(),
	license: z.string().trim().max(120).optional(),
	display: capabilityDisplaySchema,
} as const;

export const skillCapabilityManifestSchema = z
	.object({
		...commonManifestFields,
		type: z.literal("skill"),
		entry: z.literal("skill"),
		skill: z
			.object({
				entryFile: safeRelativePathSchema.default("SKILL.md"),
				targets: z
					.array(z.enum(["codex", "claude", "opencode", "cursor"]))
					.max(10)
					.default(["codex"]),
				activation: z.string().trim().max(2000).optional(),
				categories: z.array(displayStringSchema).max(20).default([]),
			})
			.strict(),
	})
	.strict();

export const cliCapabilityManifestSchema = z
	.object({
		...commonManifestFields,
		type: z.literal("cli"),
		entry: z.literal("tool"),
		cli: z
			.object({
				install: z
					.object({
						strategy: z.enum(["node", "python", "binary", "shell", "none"]),
						commands: z.array(z.string().trim().min(1).max(500)).max(10),
					})
					.strict(),
				commands: z
					.array(
						z
							.object({
								name: slugSchema,
								bin: z.string().trim().min(1).max(160),
								title: z.string().trim().min(1).max(120).optional(),
								description: z.string().trim().max(1000).optional(),
								examples: z
									.array(z.string().trim().min(1).max(500))
									.max(20)
									.default([]),
								commandExamples: z
									.array(z.string().trim().min(1).max(500))
									.max(20)
									.default([]),
							})
							.strict(),
					)
					.min(1)
					.max(20),
				env: z
					.array(
						z
							.object({
								name: z
									.string()
									.trim()
									.regex(/^[A-Z_][A-Z0-9_]*$/),
								label: z.string().trim().min(1).max(120).optional(),
								required: z.boolean().default(false),
								secret: z.boolean().default(false),
								description: z.string().trim().max(1000).optional(),
							})
							.strict(),
					)
					.max(50)
					.default([]),
				network: z.boolean().default(false),
			})
			.strict(),
	})
	.strict();

export const capabilityManifestSchema = z.discriminatedUnion("type", [
	skillCapabilityManifestSchema,
	cliCapabilityManifestSchema,
]);

export const capabilityAuditFindingSchema = z
	.object({
		severity: z.enum(["low", "medium", "high", "blocker"]),
		title: z.string().trim().min(1).max(160),
		description: z.string().trim().min(1).max(2000),
		path: z.string().trim().max(500).optional(),
	})
	.strict();

export const capabilityAuditResultSchema = z
	.object({
		status: z.enum(capabilityPackageAuditStatusValues).exclude(["pending"]),
		modelProviderId: z.string().uuid().nullable(),
		modelId: z.string().trim().min(1).max(500).nullable(),
		summary: z.string().trim().min(1).max(4000),
		findings: z.array(capabilityAuditFindingSchema).max(100),
	})
	.strict();

export const capabilityPackageFileSchema = z
	.object({
		path: safeRelativePathSchema,
		dataBase64: z.string().min(1),
	})
	.strict();

export const capabilityPackageUploadSchema = z
	.object({
		filename: z.string().trim().min(1).max(240),
		fileData: z.string().min(1),
		sourceType: z.enum(capabilityPackageSourceTypeValues).default("zip"),
		sourceRef: z.string().trim().max(1000).optional(),
	})
	.strict();

export const capabilityBindingInputSchema = z
	.object({
		capabilityVersionId: z.string().uuid(),
		enabled: z.boolean().default(true),
		config: z.record(z.string(), z.unknown()).default({}),
		displayOrder: z.number().int().min(0).max(1000).optional(),
	})
	.strict();

export const projectCapabilityBindingsSchema = z
	.object({
		projectId: z.string().uuid(),
		capabilities: z.array(capabilityBindingInputSchema).max(100),
	})
	.strict();

export const automationCapabilityBindingsSchema = z
	.object({
		automationId: z.string().uuid(),
		capabilities: z.array(capabilityBindingInputSchema).max(100),
	})
	.strict();

export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;
export type SkillCapabilityManifest = z.infer<
	typeof skillCapabilityManifestSchema
>;
export type CliCapabilityManifest = z.infer<typeof cliCapabilityManifestSchema>;
export type CapabilityAuditFinding = z.infer<
	typeof capabilityAuditFindingSchema
>;
export type CapabilityAuditResult = z.infer<typeof capabilityAuditResultSchema>;
export type CapabilityBindingInput = z.infer<
	typeof capabilityBindingInputSchema
>;
