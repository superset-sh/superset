import { createMastraCode } from "mastracode";

export type RuntimeHarness = Awaited<
	ReturnType<typeof createMastraCode>
>["harness"];
export type RuntimeDisplayState = ReturnType<RuntimeHarness["getDisplayState"]>;

export interface RuntimeSession {
	harness: RuntimeHarness;
	cwd: string;
}

const runtimes = new Map<string, RuntimeSession>();

export async function getOrCreateRuntime(
	sessionId: string,
	cwd?: string,
): Promise<RuntimeSession> {
	const existing = runtimes.get(sessionId);
	if (existing) {
		if (cwd && existing.cwd !== cwd) {
			existing.cwd = cwd;
			runtimes.set(sessionId, existing);
		}
		return existing;
	}

	const runtimeCwd = cwd ?? process.cwd();
	const runtimeMastra = await createMastraCode({ cwd: runtimeCwd });
	await runtimeMastra.harness.init();
	runtimeMastra.harness.setResourceId({ resourceId: sessionId });
	await runtimeMastra.harness.selectOrCreateThread();

	const runtime: RuntimeSession = {
		harness: runtimeMastra.harness,
		cwd: runtimeCwd,
	};
	runtimes.set(sessionId, runtime);
	return runtime;
}
