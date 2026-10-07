export interface GitLabRestDeps {
	host: string;
	token: () => Promise<string | null>;
	request?: (path: string, init: RequestInit) => Promise<Response>;
	signal?: AbortSignal;
	timeoutMs?: number;
	mergeRequest?: number;
}

export class GitLabRestError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = "GitLabRestError";
	}
}

export function encodeProjectPath(owner: string, name: string): string {
	return encodeURIComponent(`${owner}/${name}`);
}

type Params = Record<string, string | number | boolean | undefined>;

async function request(
	deps: GitLabRestDeps,
	path: string,
	params?: Params,
	write?: { method: "POST" | "PUT"; body: Record<string, unknown> },
	signal?: AbortSignal,
): Promise<Response> {
	signal?.throwIfAborted();
	const url = new URL(`https://${deps.host}/api/v4${path}`);
	for (const [key, value] of Object.entries(params ?? {})) {
		if (value !== undefined) url.searchParams.set(key, String(value));
	}
	const init: RequestInit = {
		redirect: "error",
		signal,
		headers: {
			Accept: "application/json",
			...(write ? { "Content-Type": "application/json" } : {}),
			...(deps.mergeRequest
				? { "x-superset-gitlab-merge-request": String(deps.mergeRequest) }
				: {}),
		},
		...(write
			? { method: write.method, body: JSON.stringify(write.body) }
			: {}),
	};
	const token = deps.request ? null : await deps.token();
	if (!deps.request && !token)
		throw new GitLabRestError(401, `No GitLab token for host ${deps.host}`);
	if (token)
		init.headers = { ...init.headers, Authorization: `Bearer ${token}` };
	const response = await (deps.request
		? deps.request(`${path.split("?")[0]}${url.search}`, init)
		: fetch(url.toString(), init));
	if (!response.ok) {
		void response.body?.cancel().catch(() => {});
		throw new GitLabRestError(
			response.status,
			`GitLab ${response.status} for ${path}`,
		);
	}
	return response;
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const aborted = () => reject(signal.reason);
		if (signal.aborted) {
			void pending.catch(() => {});
			reject(signal.reason);
			return;
		}
		signal.addEventListener("abort", aborted, { once: true });
		pending
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", aborted));
	});
}

async function consume<T>(
	deps: GitLabRestDeps,
	path: string,
	params: Params | undefined,
	write: { method: "POST" | "PUT"; body: Record<string, unknown> } | undefined,
	read: (response: Response) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(
		() =>
			controller.abort(new GitLabRestError(504, "GitLab request timed out")),
		deps.timeoutMs ?? 25_000,
	);
	const signal = deps.signal
		? AbortSignal.any([controller.signal, deps.signal])
		: controller.signal;
	let response: Response | undefined;
	try {
		response = await abortable(
			request(deps, path, params, write, signal),
			signal,
		);
		return await abortable(read(response), signal);
	} finally {
		clearTimeout(timeout);
		if (signal.aborted) void response?.body?.cancel().catch(() => {});
	}
}

export async function gitlabRestText(
	deps: GitLabRestDeps,
	path: string,
	maxBytes = 5 * 1024 * 1024,
): Promise<string> {
	return consume(deps, path, undefined, undefined, async (response) => {
		const reader = response.body?.getReader();
		if (!reader) return "";
		const decoder = new TextDecoder();
		let bytes = 0;
		let text = "";
		try {
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) return text + decoder.decode();
				bytes += chunk.value.byteLength;
				if (bytes > maxBytes)
					throw new GitLabRestError(
						413,
						"GitLab job logs exceed the download limit",
					);
				text += decoder.decode(chunk.value, { stream: true });
			}
		} finally {
			void reader.cancel().catch(() => {});
		}
	});
}

export async function gitlabRest<T>(
	deps: GitLabRestDeps,
	path: string,
	params?: Params,
): Promise<T> {
	return consume(
		deps,
		path,
		params,
		undefined,
		async (response) => (await response.json()) as T,
	);
}

function totalFromHeader(value: string | null): number | null {
	if (value === null || !/^\d+$/.test(value)) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) ? number : null;
}

export async function gitlabRestWithMeta<T>(
	deps: GitLabRestDeps,
	path: string,
	params?: Params,
): Promise<{
	data: T;
	total: number | null;
	totalPages: number | null;
	nextPage: number | null;
	nextPageKnown: boolean;
}> {
	return consume(deps, path, params, undefined, async (response) => {
		const next = response.headers?.get("x-next-page") ?? null;
		return {
			data: (await response.json()) as T,
			total: totalFromHeader(response.headers?.get("x-total") ?? null),
			totalPages: totalFromHeader(
				response.headers?.get("x-total-pages") ?? null,
			),
			nextPage: next === null || next === "" ? null : Number(next),
			nextPageKnown: next !== null,
		};
	});
}

export async function gitlabRestPost<T>(
	deps: GitLabRestDeps,
	path: string,
	body: Record<string, unknown>,
	method: "POST" | "PUT" = "PUT",
): Promise<T> {
	return consume(
		deps,
		path,
		undefined,
		{ body, method },
		async (response) => (await response.json()) as T,
	);
}

export async function gitlabRestAll<T>(
	deps: GitLabRestDeps,
	path: string,
	params?: Params,
): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1; ; ) {
		const response = await gitlabRestWithMeta<T[]>(deps, path, {
			...params,
			per_page: 100,
			page,
		});
		if (!Array.isArray(response.data))
			throw new GitLabRestError(502, "Invalid GitLab list response");
		items.push(...response.data);
		if (
			(response.nextPageKnown && response.nextPage === null) ||
			(!response.nextPageKnown && response.data.length < 100)
		)
			return items;
		const next = response.nextPage ?? page + 1;
		if (!Number.isSafeInteger(next) || next <= page)
			throw new GitLabRestError(502, "Invalid GitLab pagination");
		page = next;
	}
}

export async function resolveForkSourceProject(
	deps: GitLabRestDeps,
	sourceProjectId: number | undefined,
): Promise<{ owner: string; name: string } | null> {
	if (!sourceProjectId) return null;
	try {
		const project = await gitlabRest<{ path_with_namespace?: string }>(
			deps,
			`/projects/${sourceProjectId}`,
		);
		const path = project.path_with_namespace ?? "";
		const slash = path.lastIndexOf("/");
		if (slash <= 0 || slash === path.length - 1) return null;
		return { owner: path.slice(0, slash), name: path.slice(slash + 1) };
	} catch (error) {
		if (error instanceof GitLabRestError && error.status === 404) return null;
		throw error;
	}
}
