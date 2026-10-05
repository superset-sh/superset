import * as p from "@clack/prompts";
import { CLIError } from "@superset/cli-framework";

/**
 * Guards an action that cannot be undone: typing the name in a terminal, or
 * --yes without one, so an agent never does it by default.
 */
export async function confirmByName({
	name,
	consequence,
	yes,
	rerun,
}: {
	name: string;
	consequence: string;
	yes: boolean | undefined;
	rerun: string;
}): Promise<void> {
	if (yes) return;
	if (!process.stdin.isTTY) {
		throw new CLIError(consequence, `Pass --yes to go ahead: ${rerun} --yes`);
	}
	const typed = await p.text({
		message: `${consequence}. Type "${name}" to confirm`,
		validate: (value) =>
			value === name ? undefined : "The name does not match",
	});
	if (p.isCancel(typed)) throw new CLIError("Cancelled");
}
