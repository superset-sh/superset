import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatLaunchAccount } from "@superset/chat/protocol";
import { eq } from "drizzle-orm";
import { chatSessionsLocal } from "../../db";
import { FakeHarness } from "../../harness/fake";
import {
	type ChatRuntime,
	createChatRuntime,
	type HarnessFactoryOptions,
} from "../../index";
import { createBunChatDb } from "../../testing/testRuntime/testRuntime";
import { waitFor } from "../../testing/testUtils";
import { createChatCallerFactory, createChatRouter } from "./router";

const ACCOUNT: ChatLaunchAccount = {
	agent: "claude",
	selection: "/fixture/account-a",
	identity: "a".repeat(64),
	directory: "/fixture/account-a",
};
const fixtures: Array<{ runtime: ChatRuntime; dir: string }> = [];
afterEach(async () => {
	for (const f of fixtures.splice(0)) {
		await f.runtime.dispose();
		rmSync(f.dir, { recursive: true, force: true });
	}
});

function fixture(
	fixtureOptions: {
		validate?: () => void;
		beforeDispose?: () => Promise<void>;
		initialStatus?: "idle" | "dead" | "running";
		allowPendingPrompt?: boolean;
	} = {},
) {
	const dir = mkdtempSync(join(tmpdir(), "chat-account-"));
	const launches: HarnessFactoryOptions[] = [];
	let validationFailure = false;
	let forks = 0;
	const open = () =>
		createChatRuntime({
			dataDir: dir,
			openDatabase: createBunChatDb,
			validateAccountLaunch: async (context) => {
				fixtureOptions.validate?.();
				if (validationFailure || context.account.identity !== ACCOUNT.identity)
					throw new Error("saved account unavailable");
			},
			harnesses: new Map([
				[
					"claude-acp",
					(options: HarnessFactoryOptions) => {
						launches.push(options);
						const adapter = new FakeHarness({
							start: [
								{
									kind: "session",
									session: {
										status: fixtureOptions.initialStatus ?? "idle",
										harnessSessionId:
											options.resume?.harnessSessionId ??
											`native-${options.sessionId}`,
									},
								},
							],
							turns: fixtureOptions.allowPendingPrompt ? [[]] : [],
						});
						const dispose = adapter.dispose.bind(adapter);
						return Object.assign(adapter, {
							dispose: async () => {
								await fixtureOptions.beforeDispose?.();
								await dispose();
							},
							fork: async () => {
								forks++;
								return "native-branch";
							},
						});
					},
				],
			]),
		});
	const state = { runtime: open(), dir };
	fixtures.push(state);
	const caller = () =>
		createChatCallerFactory(
			createChatRouter(state.runtime, {
				resolveCwd: () => "/fixture/work",
				accountHarnesses: ["claude-acp"],
				prepareAccount: async ({ account }) => {
					if (
						account.selection !== ACCOUNT.selection ||
						account.identity !== ACCOUNT.identity
					)
						throw new Error("changed account");
					return ACCOUNT;
				},
			}),
		)({});
	return {
		state,
		launches,
		caller,
		forks: () => forks,
		fail: () => {
			validationFailure = true;
		},
		reopen: async () => {
			await state.runtime.dispose();
			state.runtime = open();
		},
	};
}

function input() {
	return {
		commandId: randomUUID(),
		workspaceId: "workspace",
		harness: "claude-acp" as const,
		account: { selection: ACCOUNT.selection, identity: ACCOUNT.identity },
	};
}
async function idle(f: ReturnType<typeof fixture>, sessionId: string) {
	await waitFor(
		() => f.state.runtime.sessions.get(sessionId)?.status === "idle",
	);
}

describe("account-bound chat lifecycle", () => {
	test("persists an explicit account before launching and reconciles create after host restart", async () => {
		const f = fixture();
		const request = input();
		const result = await f.caller().createAccountSession(request);
		await idle(f, result.sessionId);
		expect(f.launches[0]?.launchContext?.account).toEqual(ACCOUNT);
		expect(f.launches[0]?.terminalId).toBe(result.terminalId);
		await f.reopen();
		expect(await f.caller().createAccountSession(request)).toEqual(result);
		expect(
			await f
				.caller()
				.accountSessionByCommand({ commandId: request.commandId }),
		).toEqual(result);
		expect(f.launches).toHaveLength(1);
		expect(
			(await f.caller().getSession({ sessionId: result.sessionId }))
				.accountBound,
		).toBe(true);
	});

	test("concurrent identical create requests launch once and cannot repurpose their receipt", async () => {
		const f = fixture();
		const request = input();
		const [a, b] = await Promise.all([
			f.caller().createAccountSession(request),
			f.caller().createAccountSession(request),
		]);
		expect(a).toEqual(b);
		expect(f.launches).toHaveLength(1);
		await expect(
			f.caller().createAccountSession({ ...request, workspaceId: "different" }),
		).rejects.toThrow("another conversation");
	});

	test("rejects client-supplied native and pane identities", async () => {
		const f = fixture();
		await expect(
			f
				.caller()
				.createAccountSession({ ...input(), terminalId: "occupied" } as never),
		).rejects.toThrow();
		await expect(
			f.caller().createAccountSession({
				...input(),
				resume: { harnessSessionId: "foreign" },
			} as never),
		).rejects.toThrow();
		expect(f.launches).toHaveLength(0);
	});

	test("host restart resumes exact native ID in a single durable successor with original account", async () => {
		const f = fixture();
		const source = await f.caller().createAccountSession(input());
		await idle(f, source.sessionId);
		await f.reopen();
		const request = { commandId: randomUUID(), sessionId: source.sessionId };
		const recovered = await f.caller().recoverAccountSession(request);
		expect(recovered.sessionId).not.toBe(source.sessionId);
		expect(recovered.terminalId).toBe(source.terminalId);
		expect(f.launches.at(-1)?.resume).toEqual({
			harnessSessionId: `native-${source.sessionId}`,
			requireExact: true,
		});
		expect(f.launches.at(-1)?.launchContext?.account).toEqual(ACCOUNT);
		expect(await f.caller().recoverAccountSession(request)).toEqual(recovered);
		expect(
			await f
				.caller()
				.recoverAccountSession({ ...request, commandId: randomUUID() }),
		).toEqual(recovered);
		expect(f.launches).toHaveLength(2);
		expect(f.state.runtime.sessions.get(source.sessionId)).not.toBeNull();
	});

	test("an unavailable account blocks recovery and generic routes cannot drop its binding", async () => {
		const f = fixture();
		const source = await f.caller().createAccountSession(input());
		await idle(f, source.sessionId);
		await f.reopen();
		f.fail();
		await expect(
			f.caller().recoverAccountSession({
				commandId: randomUUID(),
				sessionId: source.sessionId,
			}),
		).rejects.toThrow("unavailable");
		await expect(
			f.caller().createSession({
				commandId: randomUUID(),
				workspaceId: "workspace",
				harness: "claude-acp",
				resume: { harnessSessionId: `native-${source.sessionId}` },
			}),
		).rejects.toThrow("account-aware recovery");
		await expect(
			f.caller().createSession({
				commandId: randomUUID(),
				workspaceId: "workspace",
				harness: "claude-acp",
				terminalId: source.terminalId,
			}),
		).rejects.toThrow("account-aware recovery");
		await expect(
			f.caller().createSession({
				commandId: randomUUID(),
				workspaceId: "workspace",
				harness: "claude-acp",
				account: input().account,
			} as never),
		).rejects.toThrow();
		expect(f.launches).toHaveLength(1);
	});

	test("corrupt account metadata remains readable but cannot become a default-account launch", async () => {
		const f = fixture();
		const source = await f.caller().createAccountSession(input());
		await idle(f, source.sessionId);
		await f.reopen();
		f.state.runtime.db
			.update(chatSessionsLocal)
			.set({ launchContextJson: "broken" })
			.where(eq(chatSessionsLocal.sessionId, source.sessionId))
			.run();
		const read = await f.caller().getSession({ sessionId: source.sessionId });
		expect(read.accountBound).toBe(true);
		expect(read.account).toBeNull();
		await expect(
			f.caller().recoverAccountSession({
				commandId: randomUUID(),
				sessionId: source.sessionId,
			}),
		).rejects.toThrow("invalid");
		expect(f.launches).toHaveLength(1);
	});

	test("does not resend a saved queue during recovery", async () => {
		const f = fixture();
		const source = await f.caller().createAccountSession(input());
		await idle(f, source.sessionId);
		await f.reopen();
		f.state.runtime.journal.append(source.sessionId, {
			type: "item",
			turnId: "queued-turn",
			item: {
				id: "queued-message",
				kind: "user_message",
				content: [{ type: "text", text: "not sent" }],
				startedAtMs: 1,
				queued: true,
			},
		});
		await f.reopen();
		const queue = await f.caller().getQueue({ sessionId: source.sessionId });
		expect(queue.live).toBe(false);
		expect(queue.prompts.map((p) => p.itemId)).toEqual(["queued-message"]);
		await expect(
			f.caller().recoverAccountSession({
				commandId: randomUUID(),
				sessionId: source.sessionId,
			}),
		).rejects.toThrow("unsent queued");
		expect(f.launches).toHaveLength(1);
		await f.caller().removeQueuedPrompt({
			commandId: randomUUID(),
			sessionId: source.sessionId,
			itemId: "queued-message",
		});
		expect(
			(await f.caller().getQueue({ sessionId: source.sessionId })).prompts,
		).toEqual([]);
		await f.reopen();
		expect(
			(await f.caller().getQueue({ sessionId: source.sessionId })).prompts,
		).toEqual([]);
		await f.caller().recoverAccountSession({
			commandId: randomUUID(),
			sessionId: source.sessionId,
		});
		expect(f.launches).toHaveLength(2);
	});

	test("a source change during account validation refuses recovery", async () => {
		let mutate: (() => void) | undefined;
		const f = fixture({ validate: () => mutate?.() });
		const source = await f.caller().createAccountSession(input());
		await idle(f, source.sessionId);
		await f.reopen();
		mutate = () => {
			f.state.runtime.db
				.update(chatSessionsLocal)
				.set({ title: "changed" })
				.where(eq(chatSessionsLocal.sessionId, source.sessionId))
				.run();
		};
		await expect(
			f.caller().recoverAccountSession({
				commandId: randomUUID(),
				sessionId: source.sessionId,
			}),
		).rejects.toThrow("changed or was already resumed");
		expect(f.launches).toHaveLength(1);
	});

	for (const close of ["session", "scope"] as const) {
		test(`recovery waits for ${close} disposal to actually finish`, async () => {
			let release: (() => void) | undefined;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const f = fixture({ beforeDispose: () => gate });
			const source = await f.caller().createAccountSession(input());
			await idle(f, source.sessionId);
			const closing =
				close === "scope"
					? f.state.runtime.commands.closeScope("workspace")
					: f.state.runtime.commands.closeSession({
							sessionId: source.sessionId,
						});
			try {
				await expect(
					f.caller().recoverAccountSession({
						commandId: randomUUID(),
						sessionId: source.sessionId,
					}),
				).rejects.toThrow("still closing");
				expect(f.launches).toHaveLength(1);
			} finally {
				release?.();
				await closing;
			}
			await f.caller().recoverAccountSession({
				commandId: randomUUID(),
				sessionId: source.sessionId,
			});
			expect(f.launches).toHaveLength(2);
		});
	}

	test("native forks inherit the account and duplicate requests do not fork twice", async () => {
		const f = fixture();
		const source = await f.caller().createAccountSession(input());
		await idle(f, source.sessionId);
		const request = {
			commandId: randomUUID(),
			sessionId: source.sessionId,
			workspaceId: "workspace",
		};
		const [branch, concurrent] = await Promise.all([
			f.caller().forkSession(request),
			f.caller().forkSession(request),
		]);
		expect(concurrent).toEqual(branch);
		expect(branch).not.toBeNull();
		expect(f.launches.at(-1)?.launchContext?.account).toEqual(ACCOUNT);
		expect(f.launches.at(-1)?.resume).toEqual({
			harnessSessionId: "native-branch",
			requireExact: true,
		});
		expect(await f.caller().forkSession(request)).toEqual(branch);
		expect(f.forks()).toBe(1);
		await expect(
			f.caller().forkSession({
				...request,
				commandId: randomUUID(),
				harness: "codex-acp",
			}),
		).rejects.toThrow("original agent");
	});
});

describe("explicit failed account agent stop", () => {
	async function dead(f: ReturnType<typeof fixture>, sessionId: string) {
		await waitFor(
			() => f.state.runtime.live.get(sessionId)?.state.status === "dead",
		);
	}

	test("stops only the exact failed account agent and keeps its saved conversation", async () => {
		const f = fixture({ initialStatus: "dead" });
		const source = await f.caller().createAccountSession(input());
		const other = await f.caller().createAccountSession(input());
		await dead(f, source.sessionId);
		await dead(f, other.sessionId);
		await f
			.caller()
			.closeStoppedAccountSession({ sessionId: source.sessionId });
		expect(f.state.runtime.live.get(source.sessionId)).toBeNull();
		expect(f.state.runtime.live.get(other.sessionId)).not.toBeNull();
		expect(
			f.state.runtime.sessions.get(source.sessionId)?.harnessSessionId,
		).toBe(`native-${source.sessionId}`);
		expect(
			(await f.caller().getSession({ sessionId: source.sessionId }))
				.accountBound,
		).toBe(true);
	});

	for (const initialStatus of ["idle", "running"] as const) {
		test(`refuses a registered ${initialStatus} account agent`, async () => {
			const f = fixture({ initialStatus });
			const source = await f.caller().createAccountSession(input());
			await waitFor(
				() =>
					f.state.runtime.live.get(source.sessionId)?.state.status ===
					initialStatus,
			);
			await expect(
				f.caller().closeStoppedAccountSession({ sessionId: source.sessionId }),
			).rejects.toThrow("Only a failed");
			expect(f.state.runtime.live.get(source.sessionId)).not.toBeNull();
		});
	}

	test("refuses legacy or corrupt context instead of using ordinary close", async () => {
		const f = fixture({ initialStatus: "dead" });
		const source = await f.caller().createAccountSession(input());
		await dead(f, source.sessionId);
		for (const launchContextJson of [null, "broken"]) {
			f.state.runtime.db
				.update(chatSessionsLocal)
				.set({ launchContextJson })
				.where(eq(chatSessionsLocal.sessionId, source.sessionId))
				.run();
			await expect(
				f.caller().closeStoppedAccountSession({ sessionId: source.sessionId }),
			).rejects.toThrow();
			expect(f.state.runtime.live.get(source.sessionId)).not.toBeNull();
		}
	});

	test("refuses a durable unsent message without removing it", async () => {
		const f = fixture({ initialStatus: "dead" });
		const source = await f.caller().createAccountSession(input());
		await dead(f, source.sessionId);
		f.state.runtime.journal.append(source.sessionId, {
			type: "item",
			turnId: "queued-turn",
			item: {
				id: "queued-message",
				kind: "user_message",
				content: [{ type: "text", text: "keep this draft" }],
				startedAtMs: 1,
				queued: true,
			},
		});
		await expect(
			f.caller().closeStoppedAccountSession({ sessionId: source.sessionId }),
		).rejects.toThrow("unsent queued");
		expect(f.state.runtime.live.get(source.sessionId)).not.toBeNull();
		expect(f.state.runtime.sessions.get(source.sessionId)?.queuedCount).toBe(1);
	});

	test("refuses the live queue even when the provider still reports dead", async () => {
		const f = fixture({ initialStatus: "dead", allowPendingPrompt: true });
		const source = await f.caller().createAccountSession(input());
		await dead(f, source.sessionId);
		const live = f.state.runtime.live.require(source.sessionId);
		live.prompt([{ type: "text", text: "pending delivery" }], "fixture");
		const queued = live.prompt(
			[{ type: "text", text: "keep queued" }],
			"fixture",
		);
		expect(queued.queued).toBe(true);
		await expect(
			f.caller().closeStoppedAccountSession({ sessionId: source.sessionId }),
		).rejects.toThrow("unsent queued");
		expect(live.queueState.prompts.map((p) => p.itemId)).toEqual([
			queued.itemId,
		]);
	});

	test("keeps recovery blocked when provider disposal fails without confirming exit", async () => {
		const f = fixture({
			initialStatus: "dead",
			beforeDispose: async () => {
				throw new Error("provider exit unconfirmed");
			},
		});
		const source = await f.caller().createAccountSession(input());
		await dead(f, source.sessionId);
		await expect(
			f.caller().closeStoppedAccountSession({ sessionId: source.sessionId }),
		).rejects.toThrow("provider exit unconfirmed");
		expect(f.state.runtime.live.isClosing(source.sessionId)).toBe(true);
		await expect(
			f.caller().recoverAccountSession({
				commandId: randomUUID(),
				sessionId: source.sessionId,
			}),
		).rejects.toThrow("still closing");
		await expect(
			f.caller().closeStoppedAccountSession({ sessionId: source.sessionId }),
		).rejects.toThrow("still closing");
		expect(f.launches).toHaveLength(1);
	});

	test("prevents enqueue and recovery until confirmed disposal finishes", async () => {
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const f = fixture({ initialStatus: "dead", beforeDispose: () => gate });
		const source = await f.caller().createAccountSession(input());
		await dead(f, source.sessionId);
		const closing = f.state.runtime.commands.closeStoppedAccountSession({
			sessionId: source.sessionId,
		});
		try {
			expect(f.state.runtime.live.isClosing(source.sessionId)).toBe(true);
			expect(() =>
				f.state.runtime.commands.prompt({
					commandId: randomUUID(),
					sessionId: source.sessionId,
					clientId: "fixture",
					content: [{ type: "text", text: "must not enqueue" }],
				}),
			).toThrow("not running");
			await expect(
				f.caller().recoverAccountSession({
					commandId: randomUUID(),
					sessionId: source.sessionId,
				}),
			).rejects.toThrow("still closing");
			await expect(
				f.caller().closeStoppedAccountSession({ sessionId: source.sessionId }),
			).rejects.toThrow("still closing");
		} finally {
			release?.();
			await closing;
		}
		expect(f.state.runtime.live.isClosing(source.sessionId)).toBe(false);
		expect(f.state.runtime.sessions.get(source.sessionId)?.queuedCount).toBe(0);
	});
});
