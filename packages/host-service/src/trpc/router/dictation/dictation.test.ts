import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import { DictationError } from "../../../dictation/superwhisper";
import type { HostServiceContext } from "../../../types";
import { createSuperwhisperSettingsRouter } from "../settings/superwhisper";
import { createDictationRouter, MAX_DICTATION_BYTES } from "./dictation";

const databases: Database[] = [];
afterEach(() => {
	for (const db of databases.splice(0)) db.close();
});

function fixture() {
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema });
	migrate(db, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	let ready = false;
	let fail: DictationError | undefined;
	const audios: Buffer[] = [];
	const adapter = {
		status: async () => ({ installed: true, modeReady: ready }),
		ensureMode: async () => {
			if (fail) throw fail;
			ready = true;
		},
		transcribe: async (audio: Buffer) => {
			if (fail) throw fail;
			audios.push(audio);
			return { text: "transcribed" };
		},
	};
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	return {
		db,
		ctx,
		audios,
		adapter,
		settings: createSuperwhisperSettingsRouter(adapter).createCaller(ctx),
		dictation: createDictationRouter(adapter).createCaller(ctx),
		fail: (error: DictationError) => {
			fail = error;
		},
	};
}

describe("host Superwhisper procedures", () => {
	it("defaults to disabled with installation status", async () => {
		const f = fixture();
		expect(await f.settings.get()).toEqual({
			enabled: false,
			installed: true,
			modeReady: false,
		});
		await expect(
			f.dictation.transcribe({ audio: "YQ==", mediaType: "audio/mp4" }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			cause: { kind: "DISABLED" },
		});
		expect(f.audios).toHaveLength(0);
	});
	it("persists enablement only after mode preparation and preserves other settings", async () => {
		const f = fixture();
		f.db
			.insert(schema.hostSettings)
			.values({ id: 1, worktreeBaseDir: "/worktrees" })
			.run();
		expect(await f.settings.set({ enabled: true })).toEqual({
			enabled: true,
			installed: true,
			modeReady: true,
		});
		expect(await f.settings.get()).toMatchObject({ enabled: true });
		expect(f.db.select().from(schema.hostSettings).get()?.worktreeBaseDir).toBe(
			"/worktrees",
		);
		f.fail(new DictationError("UNAVAILABLE", "not installed"));
		await f.settings.set({ enabled: false });
		expect(await f.settings.get()).toMatchObject({ enabled: false });
	});
	it.each([
		true,
		false,
	])("returns persisted enablement if status fails (enabled: %s)", async (enabled) => {
		const f = fixture();
		f.adapter.status = async () => {
			throw new Error("Cannot read preferences");
		};
		expect(await f.settings.set({ enabled })).toEqual({
			enabled,
			installed: false,
			modeReady: false,
		});
		expect(
			f.db.select().from(schema.hostSettings).get()?.superwhisperEnabled,
		).toBe(enabled);
	});
	it("does not enable after preparation fails", async () => {
		const f = fixture();
		f.fail(new DictationError("MODE_NOT_READY", "missing mode"));
		await expect(f.settings.set({ enabled: true })).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			cause: { kind: "MODE_NOT_READY" },
		});
		expect(await f.settings.get()).toMatchObject({ enabled: false });
	});
	it("decodes valid audio and returns adapter text", async () => {
		const f = fixture();
		await f.settings.set({ enabled: true });
		expect(
			await f.dictation.transcribe({ audio: "YQ==", mediaType: "audio/mp4" }),
		).toEqual({ text: "transcribed" });
		expect(f.audios).toEqual([Buffer.from("a")]);
	});
	it("rejects malformed, noncanonical and oversized base64 before transcription", async () => {
		const f = fixture();
		await f.settings.set({ enabled: true });
		for (const audio of ["", "!!!!", "YQ", "YR=="]) {
			await expect(
				f.dictation.transcribe({ audio, mediaType: "audio/wav" }),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				cause: { kind: "INVALID_AUDIO" },
			});
		}
		const audio = "A".repeat(Math.ceil((MAX_DICTATION_BYTES + 1) / 3) * 4);
		await expect(
			f.dictation.transcribe({ audio, mediaType: "audio/mp4" }),
		).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
		expect(f.audios).toHaveLength(0);
	});
	it("preserves typed adapter failures", async () => {
		const f = fixture();
		await f.settings.set({ enabled: true });
		f.fail(new DictationError("TIMEOUT", "license unavailable"));
		await expect(
			f.dictation.transcribe({ audio: "YQ==", mediaType: "audio/mp4" }),
		).rejects.toMatchObject({
			code: "TIMEOUT",
			message: "license unavailable",
			cause: { kind: "TIMEOUT" },
		});
	});
	it("serializes typed dictation errors for remote clients", async () => {
		const f = fixture();
		const response = await fetchRequestHandler({
			endpoint: "/trpc",
			req: new Request("http://localhost/trpc/transcribe", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					json: { audio: "YQ==", mediaType: "audio/mp4" },
				}),
			}),
			router: createDictationRouter(f.adapter),
			createContext: () => f.ctx,
		});
		const body = (await response.json()) as {
			error: { json: { data: { dictation: { kind: string } } } };
		};
		expect(body.error.json.data.dictation).toEqual({ kind: "DISABLED" });
	});
	it("requires authentication for new procedures", async () => {
		const f = fixture();
		const ctx = { ...f.ctx, isAuthenticated: false };
		await expect(
			createSuperwhisperSettingsRouter(f.adapter).createCaller(ctx).get(),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(
			createDictationRouter(f.adapter)
				.createCaller(ctx)
				.transcribe({ audio: "YQ==", mediaType: "audio/mp4" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
