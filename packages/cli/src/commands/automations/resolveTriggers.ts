import { readFileSync } from "node:fs";
import { CLIError } from "@superset/cli-framework";
import {
	type DraftTrigger,
	draftTriggerSchema,
} from "@superset/shared/automation-triggers";

const HINT =
	'Expected a JSON array of {config: {...}}, e.g. [{"config":{"kind":"slack","event":"reaction_added","channels":{"mode":"list","ids":["C123"]},"emoji":{"mode":"list","ids":["bug"]},"actor":{"mode":"any"}}}]. Run `superset automations trigger-options --group slack` to resolve ids.';

export function resolveTriggers(options: {
	triggers?: string | null;
	triggersFile?: string | null;
}): DraftTrigger[] | undefined {
	const raw = options.triggers
		? options.triggers
		: options.triggersFile
			? readFileSync(options.triggersFile, "utf-8")
			: null;
	if (raw === null) return undefined;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new CLIError(
			`Could not parse the trigger set as JSON: ${
				error instanceof Error ? error.message : String(error)
			}`,
			HINT,
		);
	}

	if (!Array.isArray(parsed)) {
		throw new CLIError("The trigger set must be a JSON array", HINT);
	}

	const result = draftTriggerSchema.array().max(25).safeParse(parsed);
	if (!result.success) {
		const detail = result.error.issues
			.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
			.join("; ");
		throw new CLIError(`Invalid trigger set — ${detail}`, HINT);
	}
	return result.data;
}
