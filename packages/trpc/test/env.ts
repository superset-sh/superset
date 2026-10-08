import { afterAll } from "bun:test";

// Every test file shares one process, so a value set here must be put back.
export function setTestEnv(values: Record<string, string | undefined>): void {
	const previous = Object.fromEntries(
		Object.keys(values).map((key) => [key, process.env[key]]),
	);
	assign(values);
	afterAll(() => assign(previous));
}

function assign(values: Record<string, string | undefined>): void {
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}
