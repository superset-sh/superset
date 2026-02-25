import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { type Context, Hono } from "hono";
import { createMastraCode, type MastraCodeConfig } from "mastracode";
import {
	approvalBodySchema,
	controlBodySchema,
	crashBodySchema,
	logsQuerySchema,
	type OpenSessionBody,
	openSessionBodySchema,
	planBodySchema,
	questionBodySchema,
	sendMessageBodySchema,
} from "./zod";

interface SessionRuntime {
	sessionId: string;
	harness: Awaited<ReturnType<typeof createMastraCode>>["harness"];
	unsubscribe: () => void;
	inFlight?: Promise<void>;
	sequenceHint: number;
	cwd: string;
	createdAt: string;
	updatedAt: string;
}

type ProbeLogChannel = "service" | "submit" | "harness";

interface ProbeLogRecord {
	timestamp: string;
	sessionId?: string;
	sequenceHint?: number;
	channel: ProbeLogChannel;
	payload: unknown;
}

export interface CreateMastraProbeServiceOptions {
	logFilePath: string;
	basePath?: string;
	defaultCwd?: string;
	baseConfig?: Omit<MastraCodeConfig, "cwd">;
}

function normalizeBasePath(input: string | undefined): string {
	if (!input) return "/chat-mastra/test";
	const trimmed = input.trim();
	if (!trimmed) return "/chat-mastra/test";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function toMastraImages(
	files:
		| Array<{ url: string; mediaType: string; filename?: string }>
		| undefined,
): Array<{ data: string; mimeType: string }> {
	if (!files || files.length === 0) return [];

	const images: Array<{ data: string; mimeType: string }> = [];
	for (const file of files) {
		if (!file.url.startsWith("data:")) continue;
		const commaIndex = file.url.indexOf(",");
		if (commaIndex <= 0) continue;
		const header = file.url.slice(0, commaIndex);
		const data = file.url.slice(commaIndex + 1);
		if (!header.includes(";base64") || !data) continue;
		images.push({
			data,
			mimeType: file.mediaType,
		});
	}

	return images;
}

function validationError(c: Context, error: unknown) {
	return c.json(
		{
			error: "Invalid request",
			details: error,
		},
		400,
	);
}

export function createMastraProbeService({
	logFilePath,
	basePath,
	defaultCwd,
	baseConfig,
}: CreateMastraProbeServiceOptions): {
	app: Hono;
	closeAllSessions: () => Promise<void>;
	getSessionIds: () => string[];
} {
	const app = new Hono();
	const routeBase = normalizeBasePath(basePath);
	const perSessionLogDir = path.join(path.dirname(logFilePath), "sessions");
	const sessions = new Map<string, SessionRuntime>();
	const sessionLocks = new Map<string, Promise<void>>();
	let writeTail: Promise<void> = Promise.resolve();

	function appendLog(record: ProbeLogRecord): Promise<void> {
		if (!record.sessionId) {
			return Promise.resolve();
		}
		const line = `${JSON.stringify(record)}\n`;
		const target = path.join(perSessionLogDir, `${record.sessionId}.ndjson`);

		writeTail = writeTail.then(async () => {
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.appendFile(target, line, "utf8");
		});
		return writeTail;
	}

	function appendSessionEvent(
		session: SessionRuntime,
		channel: ProbeLogChannel,
		payload: unknown,
	): Promise<void> {
		session.updatedAt = new Date().toISOString();
		const record: ProbeLogRecord = {
			timestamp: new Date().toISOString(),
			sessionId: session.sessionId,
			sequenceHint: session.sequenceHint,
			channel,
			payload,
		};
		session.sequenceHint += 1;
		return appendLog(record);
	}

	async function withSessionLock<T>(
		sessionId: string,
		task: () => Promise<T>,
	): Promise<T> {
		const previous = sessionLocks.get(sessionId) ?? Promise.resolve();
		let release: () => void = () => {};
		const next = new Promise<void>((resolve) => {
			release = resolve;
		});
		sessionLocks.set(
			sessionId,
			previous.catch(() => {}).then(() => next),
		);

		try {
			await previous.catch(() => {});
			return await task();
		} finally {
			release();
		}
	}

	async function openSession(input: OpenSessionBody): Promise<{
		sessionId: string;
		created: boolean;
	}> {
		const sessionId = input.sessionId ?? randomUUID();

		return withSessionLock(sessionId, async () => {
			const existing = sessions.get(sessionId);
			if (existing) {
				return { sessionId, created: false };
			}

			const cwd = input.cwd ?? defaultCwd ?? process.cwd();
			const runtime = await createMastraCode({
				...(baseConfig ?? {}),
				...(input.config ?? {}),
				cwd,
			});

			await runtime.harness.init();
			runtime.harness.setResourceId({ resourceId: sessionId });
			await runtime.harness.selectOrCreateThread();

			const now = new Date().toISOString();
			const state: SessionRuntime = {
				sessionId,
				harness: runtime.harness,
				unsubscribe: () => {},
				sequenceHint: 0,
				cwd,
				createdAt: now,
				updatedAt: now,
			};

			sessions.set(sessionId, state);
			state.unsubscribe = runtime.harness.subscribe((event) => {
				const current = sessions.get(sessionId);
				if (!current) return;
				void appendSessionEvent(current, "harness", event).catch(() => {});
			});

			await appendSessionEvent(state, "service", {
				type: "session_opened",
				cwd,
			});

			return { sessionId, created: true };
		});
	}

	async function closeSession(
		sessionId: string,
		reason: string,
	): Promise<{ closed: boolean }> {
		return withSessionLock(sessionId, async () => {
			const session = sessions.get(sessionId);
			if (!session) {
				return { closed: false };
			}

			session.unsubscribe();
			await appendSessionEvent(session, "service", {
				type: "session_closed",
				reason,
			});
			if (session.inFlight) {
				session.harness.abort();
				await session.inFlight.catch(() => {});
			}
			await session.harness.stopHeartbeats().catch(() => {});
			await session.harness.destroyWorkspace().catch(() => {});
			sessions.delete(sessionId);
			sessionLocks.delete(sessionId);
			return { closed: true };
		});
	}

	async function closeAllSessions(): Promise<void> {
		const ids = [...sessions.keys()];
		for (const sessionId of ids) {
			await closeSession(sessionId, "close_all");
		}
	}

	async function readOneLogFile(filePath: string): Promise<ProbeLogRecord[]> {
		const raw = await fs.readFile(filePath, "utf8");
		const lines = raw.split("\n").filter(Boolean);
		const result: ProbeLogRecord[] = [];
		for (const line of lines) {
			try {
				result.push(JSON.parse(line) as ProbeLogRecord);
			} catch {
				// Ignore malformed lines.
			}
		}
		return result;
	}

	async function readLogEntries(sessionId?: string): Promise<ProbeLogRecord[]> {
		try {
			if (sessionId) {
				const filePath = path.join(perSessionLogDir, `${sessionId}.ndjson`);
				return await readOneLogFile(filePath);
			}

			const entries = await fs.readdir(perSessionLogDir, {
				withFileTypes: true,
			});
			const files = entries
				.filter((entry) => entry.isFile() && entry.name.endsWith(".ndjson"))
				.map((entry) => path.join(perSessionLogDir, entry.name));

			const records = await Promise.all(
				files.map((file) => readOneLogFile(file)),
			);
			return records
				.flat()
				.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ENOENT") return [];
			throw error;
		}
	}

	app.get(`${routeBase}/health`, (c) => {
		return c.json({
			ok: true,
			routeBase,
			perSessionLogDir,
			sessionCount: sessions.size,
		});
	});

	app.get(`${routeBase}/sessions`, (c) => {
		return c.json({
			sessions: [...sessions.values()].map((session) => ({
				sessionId: session.sessionId,
				cwd: session.cwd,
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
				sequenceHint: session.sequenceHint,
			})),
		});
	});

	app.post(`${routeBase}/sessions/open`, async (c) => {
		const json = await c.req.json().catch(() => null);
		const parsed = openSessionBodySchema.safeParse(json);
		if (!parsed.success) {
			return validationError(c, parsed.error.flatten());
		}

		const result = await openSession(parsed.data);
		return c.json(result);
	});

	app.post(`${routeBase}/sessions/:sessionId/close`, async (c) => {
		const sessionId = c.req.param("sessionId");
		const result = await closeSession(sessionId, "manual_close");
		return c.json(result);
	});

	app.post(`${routeBase}/sessions/close-all`, async (c) => {
		await closeAllSessions();
		return c.json({ success: true });
	});

	app.post(`${routeBase}/sessions/:sessionId/message`, async (c) => {
		const sessionId = c.req.param("sessionId");
		const json = await c.req.json().catch(() => null);
		const parsed = sendMessageBodySchema.safeParse(json);
		if (!parsed.success) {
			return validationError(c, parsed.error.flatten());
		}

		return withSessionLock(sessionId, async () => {
			const session = sessions.get(sessionId);
			if (!session) {
				return c.json({ error: "Session not found" }, 404);
			}
			if (session.inFlight) {
				return c.json({ error: "Session is already running" }, 409);
			}

			await appendSessionEvent(session, "submit", {
				type: "user_message_submitted",
				data: parsed.data,
			});

			const images = toMastraImages(parsed.data.files);
			const runPromise = session.harness
				.sendMessage({
					content: parsed.data.content,
					...(images.length > 0 ? { images } : {}),
				})
				.catch(async (error) => {
					await appendSessionEvent(session, "service", {
						type: "send_message_failed",
						error:
							error instanceof Error
								? { message: error.message }
								: { message: "unknown sendMessage error" },
					});
				})
				.finally(() => {
					const current = sessions.get(sessionId);
					if (current?.inFlight === runPromise) {
						current.inFlight = undefined;
					}
				});
			session.inFlight = runPromise;

			return c.json({ accepted: true });
		});
	});

	app.post(`${routeBase}/sessions/:sessionId/control`, async (c) => {
		const sessionId = c.req.param("sessionId");
		const json = await c.req.json().catch(() => null);
		const parsed = controlBodySchema.safeParse(json);
		if (!parsed.success) {
			return validationError(c, parsed.error.flatten());
		}

		return withSessionLock(sessionId, async () => {
			const session = sessions.get(sessionId);
			if (!session) {
				return c.json({ error: "Session not found" }, 404);
			}

			await appendSessionEvent(session, "submit", {
				type: "control_submitted",
				data: parsed.data,
			});
			session.harness.abort();
			return c.json({ accepted: true });
		});
	});

	app.post(`${routeBase}/sessions/:sessionId/approval`, async (c) => {
		const sessionId = c.req.param("sessionId");
		const json = await c.req.json().catch(() => null);
		const parsed = approvalBodySchema.safeParse(json);
		if (!parsed.success) {
			return validationError(c, parsed.error.flatten());
		}

		return withSessionLock(sessionId, async () => {
			const session = sessions.get(sessionId);
			if (!session) {
				return c.json({ error: "Session not found" }, 404);
			}

			await appendSessionEvent(session, "submit", {
				type: "approval_submitted",
				data: parsed.data,
			});
			session.harness.respondToToolApproval({
				decision:
					parsed.data.decision === "deny" ? "decline" : parsed.data.decision,
			});
			return c.json({ accepted: true });
		});
	});

	app.post(`${routeBase}/sessions/:sessionId/question`, async (c) => {
		const sessionId = c.req.param("sessionId");
		const json = await c.req.json().catch(() => null);
		const parsed = questionBodySchema.safeParse(json);
		if (!parsed.success) {
			return validationError(c, parsed.error.flatten());
		}

		return withSessionLock(sessionId, async () => {
			const session = sessions.get(sessionId);
			if (!session) {
				return c.json({ error: "Session not found" }, 404);
			}

			await appendSessionEvent(session, "submit", {
				type: "question_submitted",
				data: parsed.data,
			});
			session.harness.respondToQuestion(parsed.data);
			return c.json({ accepted: true });
		});
	});

	app.post(`${routeBase}/sessions/:sessionId/plan`, async (c) => {
		const sessionId = c.req.param("sessionId");
		const json = await c.req.json().catch(() => null);
		const parsed = planBodySchema.safeParse(json);
		if (!parsed.success) {
			return validationError(c, parsed.error.flatten());
		}

		return withSessionLock(sessionId, async () => {
			const session = sessions.get(sessionId);
			if (!session) {
				return c.json({ error: "Session not found" }, 404);
			}

			await appendSessionEvent(session, "submit", {
				type: "plan_submitted",
				data: parsed.data,
			});
			await session.harness.respondToPlanApproval({
				planId: parsed.data.planId,
				response: {
					action: parsed.data.action === "accept" ? "approved" : "rejected",
					feedback: parsed.data.feedback,
				},
			});
			return c.json({ accepted: true });
		});
	});

	app.get(`${routeBase}/logs`, async (c) => {
		const parsed = logsQuerySchema.safeParse(c.req.query());
		if (!parsed.success) {
			return validationError(c, parsed.error.flatten());
		}

		const entries = await readLogEntries(parsed.data.sessionId);
		const limited = entries.slice(
			Math.max(0, entries.length - parsed.data.limit),
		);

		return c.json({
			count: limited.length,
			entries: limited,
		});
	});

	app.post(`${routeBase}/admin/crash`, async (c) => {
		const json = await c.req.json().catch(() => null);
		const parsed = crashBodySchema.safeParse(json);
		if (!parsed.success) {
			return validationError(c, parsed.error.flatten());
		}

		setTimeout(() => {
			process.exit(parsed.data.exitCode);
		}, parsed.data.delayMs);

		return c.json({ scheduled: true });
	});

	return {
		app,
		closeAllSessions,
		getSessionIds: () => [...sessions.keys()],
	};
}
