import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	resetManagedEnvForTests,
	setManagedEnv,
} from "../runtime/sandbox-managed-env";
import { buildV2TerminalEnv } from "./env";

const params = {
	baseEnv: { HOME: "/home/ubuntu", PATH: "/usr/bin", SHELL: "/bin/bash" },
	shell: "/bin/bash",
	supersetHomeDir: "/home/ubuntu/.superset",
	organizationId: "org-1",
	cwd: "/workspace",
	terminalId: "term-1",
	workspaceId: "ws-1",
	workspacePath: "/workspace",
	rootPath: "/workspace",
	supersetEnv: "production" as const,
	agentHookPort: "51741",
	agentHookVersion: "2",
};

describe("terminal env in a sandbox", () => {
	let runMode: string | undefined;
	let nodeEnv: string | undefined;
	beforeEach(() => {
		runMode = process.env.SUPERSET_HOST_RUN_MODE;
		nodeEnv = process.env.NODE_ENV;
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		resetManagedEnvForTests();
	});
	afterEach(() => {
		if (runMode === undefined) delete process.env.SUPERSET_HOST_RUN_MODE;
		else process.env.SUPERSET_HOST_RUN_MODE = runMode;
		resetManagedEnvForTests();
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	});

	test("a terminal opened before the first push carries no variables, only the sandbox marker", () => {
		const env = buildV2TerminalEnv(params);
		expect(env.IS_SANDBOX).toBe("1");
		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
	});

	test("a push reaches the next terminal, and a later push does not rewrite an earlier one", () => {
		setManagedEnv({ ANTHROPIC_API_KEY: "placeholder", FOO: "one" });
		const first = buildV2TerminalEnv(params);
		expect(first.ANTHROPIC_API_KEY).toBe("placeholder");
		expect(first.FOO).toBe("one");

		setManagedEnv({ FOO: "two" });
		const second = buildV2TerminalEnv(params);
		expect(second.FOO).toBe("two");
		expect(second.ANTHROPIC_API_KEY).toBeUndefined();
		expect(first.FOO).toBe("one");
	});

	test("a managed environment cannot set wrapper-owned agent markers", () => {
		setManagedEnv({
			SUPERSET_AGENT_ID: "claude",
			SUPERSET_AGENT_LAUNCH_ID: "launch-1",
			SUPERSET_NESTED_AGENT: "1",
			NODE_ENV: "development",
			NEXT_PUBLIC_X: "public-value",
			TURBO_TOKEN: "turbo-token",
			FOO: "one",
		});

		const env = buildV2TerminalEnv(params);

		expect(env.SUPERSET_AGENT_ID).toBeUndefined();
		expect(env.SUPERSET_AGENT_LAUNCH_ID).toBeUndefined();
		expect(env.SUPERSET_NESTED_AGENT).toBeUndefined();
		expect(env.NODE_ENV).toBe("development");
		expect(env.NEXT_PUBLIC_X).toBe("public-value");
		expect(env.TURBO_TOKEN).toBe("turbo-token");
		expect(env.FOO).toBe("one");
	});

	test("outside a sandbox the managed set is ignored", () => {
		process.env.SUPERSET_HOST_RUN_MODE = "local";
		setManagedEnv({ FOO: "one" });
		const env = buildV2TerminalEnv(params);
		expect(env.FOO).toBeUndefined();
		expect(env.IS_SANDBOX).toBeUndefined();
	});
});
