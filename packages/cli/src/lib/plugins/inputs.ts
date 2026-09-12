import { CLIError } from "@superset/cli-framework";
import type { RouterOutputs } from "@superset/trpc";

export type AuthInputSpec =
	RouterOutputs["plugins"]["list"][number]["authMethods"][number]["inputs"][number];

export function missingInputsError(
	pluginName: string,
	missing: AuthInputSpec[],
	all: AuthInputSpec[],
): CLIError {
	const describe = (input: AuthInputSpec) => {
		const flags = [
			input.required ? "required" : "optional",
			input.secret ? "secret" : null,
		]
			.filter(Boolean)
			.join(", ");
		return `  ${input.name.padEnd(16)} ${input.label ?? input.name} (${flags})${
			input.description ? `\n  ${" ".repeat(16)} ${input.description}` : ""
		}`;
	};

	const example = Object.fromEntries(
		all.map((input) => [input.name, `<${input.name}>`]),
	);

	return new CLIError(
		[
			`"${pluginName}" needs credentials before its tools work.`,
			"",
			"Ask the user for:",
			...missing.map(describe),
			"",
			"Then run:",
			`  superset plugins connect ${pluginName} --inputs '${JSON.stringify(example)}'`,
			"",
			"Values marked secret appear in shell history and process listings; prefer",
			"--inputs - to read the JSON from stdin.",
		].join("\n"),
	);
}

export async function parseInputs(
	raw: string | undefined,
): Promise<Record<string, string>> {
	// Only `-` reads stdin. Reading it unconditionally hangs until the timeout
	// under any harness that holds the pipe open without writing to it.
	const source = raw === "-" ? await readStdin() : raw;
	if (!source) return {};
	try {
		const parsed = JSON.parse(source) as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(parsed).map(([key, value]) => [key, String(value)]),
		);
	} catch (error) {
		throw new CLIError(
			`--inputs must be a JSON object: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export async function readStdin(): Promise<string | null> {
	if (process.stdin.isTTY) return null;
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	const text = Buffer.concat(chunks).toString("utf8").trim();
	return text || null;
}
