import { afterAll } from "bun:test";

// Every test file shares one process, so a value set here must be put back.
export function setTestEnv(values: Record<string, string>): void {
	const previous = Object.fromEntries(
		Object.keys(values).map((key) => [key, process.env[key]]),
	);
	Object.assign(process.env, values);
	afterAll(() => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});
}
