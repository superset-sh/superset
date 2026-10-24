import { z } from "zod";

export const CONFIG_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
export const MAX_PREVIEW_PORTS = 13;

const commandSchema = z.union([z.string(), z.array(z.string())]);
const cwdSchema = z.string().trim().min(1);

const phaseFields = {
	run: commandSchema.optional(),
	cwd: cwdSchema.optional(),
};
const phaseOverrideSchema = z.strictObject(phaseFields);
const phaseSchema = z.strictObject({
	...phaseFields,
	cloud: phaseOverrideSchema.optional(),
	local: phaseOverrideSchema.optional(),
});

const terminalFields = {
	run: commandSchema.optional(),
	default: z.boolean().optional(),
	cwd: cwdSchema.optional(),
};
const terminalOverrideSchema = z.strictObject(terminalFields);
const terminalSchema = z.strictObject({
	...terminalFields,
	cloud: terminalOverrideSchema.optional(),
	local: terminalOverrideSchema.optional(),
});

const portSchema = z.strictObject({
	default: z.number().int().min(1).max(65535),
	label: z.string().optional(),
	preview: z.boolean().optional(),
});

const nameSchema = z
	.string()
	.regex(
		CONFIG_NAME_PATTERN,
		"Names use lowercase letters, digits and underscores, and start with a letter",
	);

export const projectConfigSchema = z
	.strictObject({
		install: phaseSchema.optional(),
		setup: phaseSchema.optional(),
		archive: phaseSchema.optional(),
		terminals: z.record(nameSchema, terminalSchema).optional(),
		ports: z.record(nameSchema, portSchema).optional(),
	})
	.superRefine((config, ctx) => {
		const previews = Object.values(config.ports ?? {}).filter(
			(port) => port.preview,
		).length;
		if (previews > MAX_PREVIEW_PORTS) {
			ctx.addIssue({
				code: "custom",
				path: ["ports"],
				message: `At most ${MAX_PREVIEW_PORTS} ports can have preview = true`,
			});
		}
	});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type PhaseName = "install" | "setup" | "archive";
export type ConfigEnvironment = "local" | "cloud";
export type CommandValue = z.infer<typeof commandSchema>;
