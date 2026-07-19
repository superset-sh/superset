import { afterEach, describe, expect, mock, test } from "bun:test";

// The command resolves a host target and mutates through its tRPC client.
// Control both the resolved target and what `workspaces.create.mutate`
// returns per test by mocking the libs the command imports.
type CreateResult = {
	workspace: { name: string };
	agents: Array<{ ok: true } | { ok: false; error: string }>;
	alreadyExists: boolean;
};
let createResult: CreateResult = {
	workspace: { name: "test" },
	agents: [],
	alreadyExists: false,
};

mock.module("../../../lib/host-target", () => ({
	requireHostTarget: () => "host-1",
	resolveHostTarget: () => ({
		kind: "local",
		hostId: "host-1",
		client: {
			workspaces: {
				create: { mutate: async () => createResult },
			},
		},
	}),
}));
mock.module("../../../lib/upload-attachments", () => ({
	uploadAttachments: async () => [],
}));

const { default: createCommand } = await import("./command");

function makeCtx() {
	return {
		config: { organizationId: "org-1" },
		bearer: "bearer",
	} as never;
}

function invoke(options: Record<string, unknown>) {
	return createCommand.run({
		ctx: makeCtx(),
		args: {} as never,
		options: options as never,
		signal: new AbortController().signal,
	});
}

const AGENT_OPTS = {
	local: true,
	project: "proj-1",
	name: "test",
	branch: "test/silent-agent",
	agent: "agent-uuid",
	prompt: "hi",
};

afterEach(() => {
	createResult = {
		workspace: { name: "test" },
		agents: [],
		alreadyExists: false,
	};
});

describe("workspaces create — agent launch failures (#5767)", () => {
	test("warns on stderr when a requested agent fails to launch", async () => {
		createResult = {
			workspace: { name: "test" },
			agents: [
				{
					ok: false,
					error:
						"open agent-uuid: spawn failed (shell=/bin/zsh cwd=…): posix_spawnp failed.",
				},
			],
			alreadyExists: false,
		};

		const written: string[] = [];
		const spy = mock((chunk: string | Uint8Array) => {
			written.push(String(chunk));
			return true;
		});
		const original = process.stderr.write;
		process.stderr.write = spy as never;
		try {
			const result = (await invoke(AGENT_OPTS)) as { message: string };
			// Workspace still created — success message is preserved.
			expect(result.message).toContain('Created workspace "test"');
			// ...but the failure is now loud on stderr instead of only in --json.
			const stderr = written.join("");
			expect(stderr).toContain("warning: agent launch failed:");
			expect(stderr).toContain("posix_spawnp failed");
		} finally {
			process.stderr.write = original;
		}
	});

	test("--strict exits non-zero (throws) when the agent fails to launch", async () => {
		createResult = {
			workspace: { name: "test" },
			agents: [{ ok: false, error: "posix_spawnp failed." }],
			alreadyExists: false,
		};
		await expect(invoke({ ...AGENT_OPTS, strict: true })).rejects.toThrow(
			/Agent launch failed/,
		);
	});

	test("stays silent and succeeds when the agent launches cleanly", async () => {
		createResult = {
			workspace: { name: "test" },
			agents: [{ ok: true }],
			alreadyExists: false,
		};

		const written: string[] = [];
		const spy = mock((chunk: string | Uint8Array) => {
			written.push(String(chunk));
			return true;
		});
		const original = process.stderr.write;
		process.stderr.write = spy as never;
		try {
			const result = (await invoke(AGENT_OPTS)) as { message: string };
			expect(result.message).toContain('Created workspace "test"');
			expect(written.join("")).not.toContain("warning:");
		} finally {
			process.stderr.write = original;
		}
	});
});
