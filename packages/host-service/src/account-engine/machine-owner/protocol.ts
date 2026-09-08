import { z } from "zod";

const agent = z.enum(["claude", "codex"]);
const selection = z.string().max(4096);
const selectionInput = z.object({ agent, selection });
const patch = z.object({
	enabled: z.boolean().optional(),
	thresholdPercent: z.number().int().min(1).max(100).optional(),
	strategy: z.enum(["best", "consume-first"]).optional(),
	modelWindows: z.array(z.string().min(1).max(64)).max(8).optional(),
	pollIntervalSeconds: z
		.union([z.literal(30), z.literal(60), z.literal(120), z.literal(300)])
		.optional(),
	cooldownSeconds: z.number().int().min(60).max(3600).optional(),
});

export const serviceArguments = {
	status: z.tuple([]),
	getSettings: z.tuple([]),
	setSettings: z.tuple([agent, patch]),
	setRotation: z.tuple([z.string().min(1).max(256), z.boolean()]),
	history: z.tuple([z.number().int().min(1).max(200).optional()]),
	ownsLock: z.tuple([]),
	switchManually: z.tuple([agent, selection.nullable()]),
	readUsage: z.tuple([
		z
			.object({
				agents: z
					.array(z.enum(["claude", "codex", "grok", "agy"]))
					.max(4)
					.optional(),
				forceRefresh: z.boolean().optional(),
				entryKeys: z.array(z.string().max(8192)).max(10_000).optional(),
			})
			.optional(),
	]),
	removeAccount: z.tuple([
		selectionInput.extend({ acknowledgeUnknownActive: z.boolean().optional() }),
	]),
	prepareAccount: z.tuple([selectionInput]),
	provisionSelectedAccounts: z.tuple([]),
};

export const sessionSnapshots = z
	.array(
		z.object({
			row: z.object({
				workspaceId: z.string().min(1).max(256),
				terminalId: z.string().min(1).max(256),
				agent,
				managed: z.boolean(),
				configDir: selection.nullable(),
				lastEventType: z.string().max(128),
				lastEventAt: z.number().finite(),
				lastTransitionAt: z.number().finite().optional(),
				limitHintErrorType: z.string().max(128).optional(),
			}),
			busy: z.boolean(),
			alive: z.boolean(),
			started: z.boolean(),
			bracketed: z.boolean(),
		}),
	)
	.max(10_000);
