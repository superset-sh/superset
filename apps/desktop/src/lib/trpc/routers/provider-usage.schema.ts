import { z } from "zod";

const percentSchema = z.number().finite().min(0).max(100);

export const usageWindowSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	usedPercent: percentSchema,
	remainingPercent: percentSchema,
	resetAt: z.number().int().positive().nullable(),
	windowSeconds: z.number().int().positive().nullable(),
});

export const providerUsageSchema = z.object({
	providerId: z.enum(["claude", "codex"]),
	providerName: z.enum(["Claude", "Codex"]),
	status: z.enum(["ok", "not-configured", "unavailable"]),
	accountLabel: z.string().nullable(),
	windows: z.array(usageWindowSchema),
	errorMessage: z.string().nullable(),
});

export const providerUsageSnapshotSchema = z.object({
	providers: z.array(providerUsageSchema),
	collectedAt: z.number().int().positive(),
});

export type UsageWindow = z.infer<typeof usageWindowSchema>;
export type ProviderUsage = z.infer<typeof providerUsageSchema>;
export type ProviderUsageSnapshot = z.infer<typeof providerUsageSnapshotSchema>;
