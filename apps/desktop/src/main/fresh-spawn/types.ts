import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

export const SpawnRequestSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("spawn-pty-subprocess"),
		token: z.string().min(1),
		env: z.record(z.string(), z.string()),
	}),
	z.object({
		type: z.literal("fresh-exec"),
		token: z.string().min(1),
		command: z.string().min(1),
		args: z.array(z.string()),
		cwd: z.string().min(1),
		env: z.record(z.string(), z.string()),
		ptyCols: z.number().int().positive(),
		ptyRows: z.number().int().positive(),
	}),
]);

export type SpawnRequest = z.infer<typeof SpawnRequestSchema>;

export const SpawnResponseSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("ok"),
		pid: z.number().int().positive(),
	}),
	z.object({
		type: z.literal("error"),
		message: z.string(),
		code: z.string(),
	}),
]);

export type SpawnResponse = z.infer<typeof SpawnResponseSchema>;

const FRESH_SPAWN_DIR = ".superset";

export const DEFAULT_SOCKET_PATH = path.join(
	os.homedir(),
	FRESH_SPAWN_DIR,
	"fresh-spawn.sock",
);
export const DEFAULT_TOKEN_PATH = path.join(
	os.homedir(),
	FRESH_SPAWN_DIR,
	"fresh-spawn.token",
);
