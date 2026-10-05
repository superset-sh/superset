import type { ExecGh } from "../../../../trpc/router/workspace-creation/utils/exec-gh";

interface CachedResponse {
	etag: string;
	body: string;
	bytes: number;
}

function parseResponse(stdout: unknown) {
	if (typeof stdout !== "string") return null;
	const status = /^HTTP\/\S+ (\d{3})\b/.exec(stdout)?.[1];
	if (!status) return null;
	const separator = /\r?\n\r?\n/.exec(stdout);
	const headers = separator ? stdout.slice(0, separator.index) : stdout;
	return {
		status: Number(status),
		etag: /^etag:[ \t]*(.+)$/im.exec(headers)?.[1]?.trim(),
		body: separator
			? stdout.slice(separator.index + separator[0].length).trim()
			: "",
	};
}

export class ConditionalGh {
	private readonly cache = new Map<string, CachedResponse>();
	private bytes = 0;
	private generation = 0;

	constructor(
		private readonly run: ExecGh,
		private readonly limits = {
			maxEntries: 512,
			maxBytes: 16 * 1024 * 1024,
		},
	) {}

	clear() {
		this.generation++;
		this.cache.clear();
		this.bytes = 0;
	}

	private remove(key: string) {
		const entry = this.cache.get(key);
		if (entry) this.bytes -= entry.bytes;
		this.cache.delete(key);
	}

	private store(key: string, entry: CachedResponse) {
		this.remove(key);
		if (entry.bytes > this.limits.maxBytes || this.limits.maxEntries <= 0) {
			return;
		}
		this.cache.set(key, entry);
		this.bytes += entry.bytes;
		while (
			this.cache.size > this.limits.maxEntries ||
			this.bytes > this.limits.maxBytes
		) {
			const oldest = this.cache.keys().next().value;
			if (oldest === undefined) break;
			this.remove(oldest);
		}
	}

	exec: ExecGh = async (args, options) => {
		// Expects one header block and a single JSON body. A GET with --paginate,
		// or a --jq filter that prints non-JSON, cannot be parsed here: pass it through.
		if (args[0] !== "api" || args[args.indexOf("--method") + 1] !== "GET") {
			return this.run(args, options);
		}
		const key = JSON.stringify([args, options?.cwd]);
		const generation = this.generation;
		const cached = this.cache.get(key);
		const request = [...args, "--include"];
		if (cached) request.push("--header", `If-None-Match: ${cached.etag}`);

		let raw: unknown;
		try {
			raw = await this.run(request, options);
		} catch (error) {
			// gh exits 1 for HTTP 304 and leaves its response headers on stdout.
			if (
				cached &&
				error instanceof Error &&
				"code" in error &&
				error.code === 1 &&
				"stdout" in error &&
				parseResponse(error.stdout)?.status === 304
			) {
				raw = error.stdout;
			} else {
				if (generation === this.generation && this.cache.get(key) === cached) {
					this.remove(key);
				}
				throw error;
			}
		}

		const response = parseResponse(raw);
		if (!response) return raw;
		if (response.status === 304 && cached) {
			if (generation === this.generation && this.cache.get(key) === cached) {
				this.store(key, cached);
			}
			return JSON.parse(cached.body);
		}
		if (response.status !== 200) {
			throw new Error(`Unexpected GitHub response: HTTP ${response.status}`);
		}
		const result: unknown = JSON.parse(response.body);
		if (generation !== this.generation || this.cache.get(key) !== cached) {
			return result;
		}
		this.remove(key);
		if (response.etag) {
			this.store(key, {
				etag: response.etag,
				body: response.body,
				bytes: Buffer.byteLength(key + response.etag + response.body),
			});
		}
		return result;
	};
}
