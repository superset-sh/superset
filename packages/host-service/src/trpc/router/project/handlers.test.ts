import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import simpleGit from "simple-git";
import type { HostServiceContext } from "../../../types";
import { createFromImportLocal } from "./handlers";

interface MockContextOptions {
	cloudCreate: () => Promise<{ id: string }>;
}

function createMockContext({ cloudCreate }: MockContextOptions) {
	const insertChain = {
		values: () => insertChain,
		onConflictDoUpdate: () => insertChain,
		run: () => undefined,
	};

	const ctx = {
		organizationId: "00000000-0000-0000-0000-000000000000",
		api: {
			v2Project: {
				create: { mutate: mock(cloudCreate) },
			},
			host: {
				ensure: { mutate: mock(async () => ({ machineId: "host-1" })) },
			},
			v2Workspace: {
				create: { mutate: mock(async () => ({ id: "ws-1" })) },
			},
		},
		db: {
			insert: () => insertChain,
		},
		git: mock(async () => ({
			raw: async (args: string[]) => {
				if (args[0] === "symbolic-ref") return "main\n";
				throw new Error(`unexpected raw: ${args.join(" ")}`);
			},
			revparse: async () => "main",
		})),
	} as unknown as HostServiceContext;

	return ctx;
}

describe("createFromImportLocal", () => {
	let repo: string;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-import-local-"));
		await simpleGit(repo).init();
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("translates a wrapped (cause-chain) fetch failure too", async () => {
		const inner = new TypeError("fetch failed");
		const outer = new Error("Cloud call failed");
		(outer as Error & { cause?: unknown }).cause = inner;

		const ctx = createMockContext({
			cloudCreate: async () => {
				throw outer;
			},
		});

		let caught: unknown;
		try {
			await createFromImportLocal(ctx, {
				name: "mw-cli",
				repoPath: realpathSync.native(repo),
			});
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(TRPCError);
		const trpcError = caught as TRPCError;
		expect(trpcError.message.toLowerCase()).toMatch(/cloud|network|reach/);
	});

	test("surfaces a clear network error when the cloud API is unreachable", async () => {
		// Node's `fetch` throws `TypeError: fetch failed` for DNS / connection
		// failures (offline, server down, etc.). The tRPC client wraps this and
		// re-throws so it bubbles up to project.create as the same message.
		const fetchFailure = new TypeError("fetch failed");
		const ctx = createMockContext({
			cloudCreate: async () => {
				throw fetchFailure;
			},
		});

		let caught: unknown;
		try {
			await createFromImportLocal(ctx, {
				name: "mw-cli",
				repoPath: realpathSync.native(repo),
			});
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(TRPCError);
		const trpcError = caught as TRPCError;
		// Generic "fetch failed" is meaningless to end users — the handler
		// should translate it into something that mentions the cloud/network.
		expect(trpcError.message).not.toBe("fetch failed");
		expect(trpcError.message.toLowerCase()).toMatch(/cloud|network|reach/);
	});
});
