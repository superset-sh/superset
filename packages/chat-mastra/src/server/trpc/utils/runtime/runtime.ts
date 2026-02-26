import { createMastraCode } from "mastracode";
import { ensureMastraCodeMcpBridge } from "./mcp-bridge";

export type RuntimeHarness = Awaited<
	ReturnType<typeof createMastraCode>
>["harness"];
export type RuntimeMcpManager = Awaited<
	ReturnType<typeof createMastraCode>
>["mcpManager"];
export type RuntimeDisplayState = ReturnType<RuntimeHarness["getDisplayState"]>;

export interface RuntimeSession {
	harness: RuntimeHarness;
	mcpManager: RuntimeMcpManager;
	cwd: string;
}

const runtimes = new Map<string, RuntimeSession>();
const runtimeInFlight = new Map<string, Promise<RuntimeSession>>();

export async function getOrCreateRuntime(
	sessionId: string,
	cwd?: string,
	options?: {
		authToken?: string;
	},
): Promise<RuntimeSession> {
	const runtimeCwd = cwd ?? runtimes.get(sessionId)?.cwd ?? process.cwd();
	ensureMastraCodeMcpBridge({
		cwd: runtimeCwd,
		authToken: options?.authToken,
	});

	const existing = runtimes.get(sessionId);
	if (existing) {
		if (!cwd || existing.cwd === cwd) {
			return existing;
		}
		// Runtime sessions are cwd-bound. Recreate when cwd changes.
		runtimes.delete(sessionId);
	}

	const pending = runtimeInFlight.get(sessionId);
	if (pending) {
		const runtime = await pending;
		if (!cwd || runtime.cwd === cwd) {
			return runtime;
		}
		// CWD changed while create was in-flight; recreate for requested cwd.
		runtimes.delete(sessionId);
	}

	const createRuntimePromise = (async () => {
		const runtimeMastra = await createMastraCode({ cwd: runtimeCwd });
		if (runtimeMastra.mcpManager?.hasServers()) {
			await runtimeMastra.mcpManager.init();
		}
		await runtimeMastra.harness.init();
		runtimeMastra.harness.setResourceId({ resourceId: sessionId });
		await runtimeMastra.harness.selectOrCreateThread();

		const runtime: RuntimeSession = {
			harness: runtimeMastra.harness,
			mcpManager: runtimeMastra.mcpManager,
			cwd: runtimeCwd,
		};
		runtimes.set(sessionId, runtime);
		return runtime;
	})();

	runtimeInFlight.set(sessionId, createRuntimePromise);
	try {
		return await createRuntimePromise;
	} finally {
		runtimeInFlight.delete(sessionId);
	}
}
