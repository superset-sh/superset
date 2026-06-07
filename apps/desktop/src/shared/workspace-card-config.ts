import { z } from "zod";

/**
 * A user-defined command card line: a shell command that runs in the
 * workspace folder; the first line of its output renders on the card. Same
 * trust model as the project's setup/run scripts. `type` defaults to
 * "command" so pre-existing configs without the field keep parsing.
 */
export const commandCardLineSchema = z.object({
	id: z.string(),
	type: z.literal("command").default("command"),
	label: z.string().default(""),
	command: z.string(),
	enabled: z.boolean().default(true),
});

/**
 * A component card line: `component` names an entry in the renderer-side
 * registry (WorkspaceCardLineComponents) instead of a shell command. Unknown
 * keys render nothing, so configs stay forward-compatible.
 */
export const componentCardLineSchema = z.object({
	id: z.string(),
	type: z.literal("component"),
	label: z.string().default(""),
	component: z.string(),
	enabled: z.boolean().default(true),
});

// A union (not discriminatedUnion) so bare { id, label, command, enabled }
// lines written before `type` existed still parse as command lines.
export const customCardLineSchema = z.union([
	componentCardLineSchema,
	commandCardLineSchema,
]);

export type CommandCardLine = z.infer<typeof commandCardLineSchema>;
export type ComponentCardLine = z.infer<typeof componentCardLineSchema>;
export type CustomCardLine = z.infer<typeof customCardLineSchema>;

/**
 * Which lines the sidebar workspace cards show. Lives in the project's
 * .superset/config.json under "workspaceCard" — same per-project, in-repo
 * config surface as setup/teardown scripts. Everything defaults to on:
 * cards are multi-line out of the box and users prune from there.
 */
export const workspaceCardConfigSchema = z.object({
	prTitle: z.boolean().default(true),
	prChecks: z.boolean().default(true),
	diffStats: z.boolean().default(true),
	status: z.boolean().default(true),
	linearTicket: z.boolean().default(true),
	customLines: z.array(customCardLineSchema).default([]),
});

export type WorkspaceCardConfig = z.infer<typeof workspaceCardConfigSchema>;

export const DEFAULT_WORKSPACE_CARD_CONFIG: WorkspaceCardConfig =
	workspaceCardConfigSchema.parse({});

export function parseWorkspaceCardConfig(value: unknown): WorkspaceCardConfig {
	const result = workspaceCardConfigSchema.safeParse(value ?? {});
	return result.success ? result.data : DEFAULT_WORKSPACE_CARD_CONFIG;
}

function customCardLinesEqual(a: CustomCardLine, b: CustomCardLine): boolean {
	if (
		a.id !== b.id ||
		a.label !== b.label ||
		a.enabled !== b.enabled ||
		a.type !== b.type
	) {
		return false;
	}
	if (a.type === "command" && b.type === "command") {
		return a.command === b.command;
	}
	if (a.type === "component" && b.type === "component") {
		return a.component === b.component;
	}
	return false;
}

/**
 * Computes a deterministic hash over the sorted set of enabled command strings
 * in a config. Used as the trust key: if the repo's command set changes, the
 * stored hash no longer matches and the project is treated as untrusted again.
 * Pure function — no side effects, safe to call in any context.
 */
export function commandSetHash(config: WorkspaceCardConfig): string {
	const commands = config.customLines
		.filter((l) => l.type === "command" && l.enabled)
		.map((l) => (l.type === "command" ? l.command : ""))
		.sort();
	// Stable JSON fingerprint — no crypto needed for a display/trust key.
	return JSON.stringify(commands);
}

/**
 * Deep equality over parsed configs. Used to decide whether a submitted
 * config still matches the repo/file-resolved one — in which case no local
 * override should be stored and the file stays authoritative.
 */
export function workspaceCardConfigsEqual(
	a: WorkspaceCardConfig,
	b: WorkspaceCardConfig,
): boolean {
	return (
		a.prTitle === b.prTitle &&
		a.prChecks === b.prChecks &&
		a.diffStats === b.diffStats &&
		a.status === b.status &&
		a.linearTicket === b.linearTicket &&
		a.customLines.length === b.customLines.length &&
		a.customLines.every((line, i) =>
			customCardLinesEqual(line, b.customLines[i]),
		)
	);
}
