import {
	Redis,
	type RedisConfigNodejs,
	type Requester,
	type UpstashRequest,
} from "@upstash/redis";
import IORedis from "ioredis";
import { redisUrl } from "./redis-url";

export type KvClient = Pick<
	Redis,
	| "eval"
	| "evalsha"
	| "get"
	| "set"
	| "del"
	| "hset"
	| "hget"
	| "hexists"
	| "zadd"
	| "zrange"
>;

class NativeKv extends Redis {
	constructor(requester: Requester) {
		super(requester);
		this.enableAutoPipelining = false;
	}
}

export function createKv(
	config?: Pick<RedisConfigNodejs, "url" | "token">,
): KvClient {
	if (process.env.SELF_HOST_KV === "1") {
		const url = redisUrl.safeParse(
			process.env.REDIS_URL || "redis://127.0.0.1:6379",
		);
		if (!url.success)
			throw new Error("REDIS_URL must use redis:// or rediss://");
		const client = new IORedis(url.data, { lazyConnect: true });
		client.on("error", (error: Error) => {
			console.error("[kv] native Redis connection failed:", error.message);
		});
		const commands = new Set([
			"GET",
			"SET",
			"DEL",
			"HSET",
			"HGET",
			"HEXISTS",
			"ZADD",
			"ZRANGE",
			"EVAL",
			"EVALSHA",
		]);
		const requester: Requester = {
			async request<TResult>({ body }: UpstashRequest) {
				if (!Array.isArray(body) || typeof body[0] !== "string") {
					throw new Error("Invalid native KV command");
				}
				const command = body[0].toUpperCase();
				if (!commands.has(command))
					throw new Error(`Unsupported native KV command: ${command}`);
				const args = body.slice(1).map((value: unknown) => {
					if (typeof value === "boolean") return String(value);
					if (typeof value !== "string" && typeof value !== "number") {
						throw new Error(
							`Invalid argument for native KV command: ${command}`,
						);
					}
					return value;
				});
				return { result: (await client.call(command, ...args)) as TResult };
			},
		};
		return new NativeKv(requester);
	}
	return new Redis(
		config ?? {
			url: process.env.KV_REST_API_URL,
			token: process.env.KV_REST_API_TOKEN,
		},
	);
}
