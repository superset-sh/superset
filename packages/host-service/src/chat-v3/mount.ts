import { dirname } from "node:path";
import type { NodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import type { DeltaChannel } from "@superset/chat/protocol";
import { parseCursor } from "@superset/chat/protocol";
import type {
	ChatRuntime,
	HarnessFactory,
	HarnessRegistry,
	WsSinkSocket,
} from "@superset/chat-runtime";
import {
	CodexAdapter,
	createChatRouter,
	createChatRuntime,
	createClaudeAdapter,
	createWsSink,
	DEFAULT_MIGRATIONS_FOLDER,
} from "@superset/chat-runtime";
import type { Hono, MiddlewareHandler } from "hono";
import type { HostDb } from "../db";
import { createResolveCwd } from "./resolveCwd";

export const CHAT_V3_TRPC_PATH = "/chat-v3/trpc";
export const CHAT_V3_STREAM_PATH = "/chat-v3/sessions/:sessionId/stream";

/**
 * `src/db/drizzle/` is a runtime file dependency the desktop bundle does not
 * inline: packaged builds must ship the folder and point here at it.
 */
function migrationsFolder(): string {
	return process.env.SUPERSET_CHAT_V3_MIGRATIONS ?? DEFAULT_MIGRATIONS_FOLDER;
}

function harnessRegistry(): HarnessRegistry {
	const entries: [string, HarnessFactory][] = [
		["claude-code", () => createClaudeAdapter()],
		["codex", () => new CodexAdapter()],
	];
	return new Map(entries);
}

export type ChatV3Mount = {
	runtime(): ChatRuntime;
	dispose(): Promise<void>;
};

/**
 * Lazily built: opening chat.db and running its migrations is work no host
 * should pay for until something actually asks for a chat session.
 */
export function createChatV3Mount(options: {
	db: HostDb;
	dbPath: string;
}): ChatV3Mount {
	let built: ChatRuntime | null = null;

	const runtime = (): ChatRuntime => {
		if (built) return built;
		built = createChatRuntime({
			dataDir: dirname(options.dbPath),
			migrationsFolder: migrationsFolder(),
			harnesses: harnessRegistry(),
		});
		return built;
	};

	return {
		runtime,
		dispose: async () => {
			const current = built;
			built = null;
			await current?.dispose();
		},
	};
}

export function registerChatV3Routes(options: {
	app: Hono;
	db: HostDb;
	mount: ChatV3Mount;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
	trpcPath?: string;
	streamPath?: string;
}): void {
	const resolveCwd = createResolveCwd(options.db);

	const endpoint = options.trpcPath ?? CHAT_V3_TRPC_PATH;
	// Built on first request, not at registration: touching `runtime()` here
	// would open chat.db on every gated host at startup.
	let handler: MiddlewareHandler | null = null;
	options.app.use(`${endpoint}/*`, (c, next) => {
		handler ??= trpcServer({
			endpoint,
			router: createChatRouter(options.mount.runtime(), { resolveCwd }),
		});
		return handler(c, next);
	});

	options.app.get(
		options.streamPath ?? CHAT_V3_STREAM_PATH,
		options.upgradeWebSocket((c) => {
			const sessionId = c.req.param("sessionId") ?? "";
			const sinceRaw = c.req.query("since");
			const deltasRaw = c.req.query("deltas");
			let unsubscribe: (() => void) | null = null;

			return {
				onOpen: (_event, ws) => {
					const socket = ws as unknown as WsSinkSocket;
					let since: ReturnType<typeof parseCursor> | undefined;
					if (sinceRaw !== undefined) {
						try {
							since = parseCursor(sinceRaw);
						} catch {
							socket.close();
							return;
						}
					}

					const deltas = (deltasRaw ?? "")
						.split(",")
						.map((channel) => channel.trim())
						.filter(
							(channel): channel is DeltaChannel =>
								channel === "text" ||
								channel === "tool_input" ||
								channel === "terminal",
						);

					const subscription = options.mount
						.runtime()
						.subscribe(sessionId, { since, deltas }, createWsSink(socket));
					unsubscribe = () => subscription.unsubscribe();
				},

				onMessage: () => {
					// Server-to-client stream; commands ride the tRPC router.
				},

				onClose: () => {
					unsubscribe?.();
					unsubscribe = null;
				},

				onError: () => {
					unsubscribe?.();
					unsubscribe = null;
				},
			};
		}),
	);
}
