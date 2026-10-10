import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import command from "./command";

const show = mock(async () => ({ shown: true }));
withLocalHostService("org-1", { "notifications.show": show as never });

const ENV_KEYS = ["SUPERSET_WORKSPACE_ID", "SUPERSET_TERMINAL_ID"] as const;
const saved = ENV_KEYS.map((key) => process.env[key]);

function invoke(options: Record<string, unknown> = {}) {
	return command.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: { title: "Tests pass" } as never,
		options: options as never,
		signal: new AbortController().signal,
	});
}

beforeEach(() => {
	show.mockClear();
	process.env.SUPERSET_WORKSPACE_ID = "ws-env";
	process.env.SUPERSET_TERMINAL_ID = "term-env";
});

afterEach(() => {
	ENV_KEYS.forEach((key, i) => {
		if (saved[i] === undefined) delete process.env[key];
		else process.env[key] = saved[i];
	});
});

describe("notifications show", () => {
	test("from a Superset terminal, a click opens the calling terminal", async () => {
		await invoke({ body: "12 passed", sound: true });
		expect(show).toHaveBeenLastCalledWith({
			title: "Tests pass",
			body: "12 passed",
			sound: true,
			target: { workspaceId: "ws-env", terminalId: "term-env" },
		});
	});

	test("an explicit terminal overrides the calling one", async () => {
		await invoke({ terminal: "term-other" });
		expect(show).toHaveBeenLastCalledWith(
			expect.objectContaining({
				target: { workspaceId: "ws-env", terminalId: "term-other" },
			}),
		);
	});
});
