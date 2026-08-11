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

export const providerUsageAccountSchema = z.object({
	id: z.string().min(1),
	providerId: z.enum(["claude", "codex"]),
	profileName: z.string().min(1),
	accountLabel: z.string().nullable(),
	planLabel: z.string().nullable(),
	isActive: z.boolean(),
	status: z.enum(["ok", "cached", "no-data", "error"]),
	statusMessage: z.string().nullable(),
	windows: z.array(usageWindowSchema),
});

export const providerUsageSchema = z.object({
	providerId: z.enum(["claude", "codex"]),
	providerName: z.enum(["Claude", "Codex"]),
	status: z.enum(["ok", "not-configured", "unavailable"]),
	accountLabel: z.string().nullable(),
	activeAccountId: z.string().nullable(),
	accounts: z.array(providerUsageAccountSchema),
	windows: z.array(usageWindowSchema),
	errorMessage: z.string().nullable(),
});

export const providerUsageSnapshotSchema = z.object({
	providers: z.array(providerUsageSchema),
	collectedAt: z.number().int().positive(),
});

export type UsageWindow = z.infer<typeof usageWindowSchema>;
export type ProviderUsageAccount = z.infer<typeof providerUsageAccountSchema>;
export type ProviderUsage = z.infer<typeof providerUsageSchema>;
export type ProviderUsageSnapshot = z.infer<typeof providerUsageSnapshotSchema>;
