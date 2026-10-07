import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { GitCredentialProvider } from "../../../../runtime/git";
import { getToolEnvironment } from "../../../../terminal/clean-shell-env";

const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const execFileAsync = promisify(execFile);

function authority(value: string): string {
	const raw = value.trim();
	if (!/^(?:https:\/\/)?[^\s/%\\@?#]+\/?$/.test(raw))
		throw new Error("Invalid GitLab authority");
	const url = new URL(raw.startsWith("https://") ? raw : `https://${raw}`);
	if (
		url.protocol !== "https:" ||
		!url.hostname ||
		url.hostname === "github.com" ||
		url.pathname !== "/" ||
		url.username ||
		url.password
	)
		throw new Error("Invalid GitLab authority");
	return url.host;
}

export const gitlabRepositoryInputSchema = z.object({
	host: z
		.string()
		.min(1)
		.max(1024)
		.transform((value, ctx) => {
			try {
				return authority(value);
			} catch {
				ctx.addIssue({ code: "custom", message: "Invalid GitLab authority" });
				return z.NEVER;
			}
		}),
	page: z.number().int().min(1).max(MAX_PAGES).default(1),
	search: z
		.string()
		.max(256)
		.optional()
		.transform((value) => value?.trim() || undefined),
});

type ListingInput = z.input<typeof gitlabRepositoryInputSchema>;
type Credentials = Pick<GitCredentialProvider, "getToken">;
type ListingFetch = (
	url: string,
	init: {
		headers: Record<string, string>;
		redirect: "error";
		signal: AbortSignal;
	},
) => Promise<Response>;

export interface GitLabRepositoryDependencies {
	environment?: () => Promise<Record<string, string>>;
	readGlobalHost?: (
		env: Record<string, string>,
		signal: AbortSignal,
	) => Promise<string>;
	fetch?: ListingFetch;
	timeoutMs?: number;
}

export interface LegacyGitLabHost {
	host: string;
	source:
		| "env:GITLAB_HOST"
		| "env:GITLAB_URI"
		| "env:GL_HOST"
		| "glab-default"
		| "documented-public-default";
}

function checkDeadline(signal: AbortSignal): void {
	if (signal.aborted)
		throw new TRPCError({
			code: "TIMEOUT",
			message: "GitLab repository listing timed out.",
		});
}

async function bounded<T>(
	deps: GitLabRepositoryDependencies,
	operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation(controller.signal),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					controller.abort();
					reject(
						new TRPCError({
							code: "TIMEOUT",
							message: "GitLab repository listing timed out.",
						}),
					);
				}, deps.timeoutMs ?? 30_000);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function readGlobalHost(
	env: Record<string, string>,
	signal: AbortSignal,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "superset-glab-host-"));
	try {
		checkDeadline(signal);
		const metadataEnv: Record<string, string> = {
			...env,
			GLAB_SHOW_WHATS_NEW: "false",
			GLAB_SEND_TELEMETRY: "false",
			GLAB_CHECK_UPDATE: "false",
			CHECK_UPDATE: "false",
		};
		if (metadataEnv.GLAB_CONFIG_DIR)
			metadataEnv.GLAB_CONFIG_DIR = resolve(metadataEnv.GLAB_CONFIG_DIR);
		for (const name of Object.keys(metadataEnv)) {
			if (
				name.startsWith("GIT_") ||
				[
					"GITLAB_HOST",
					"GITLAB_URI",
					"GL_HOST",
					"GITLAB_TOKEN",
					"GITLAB_ACCESS_TOKEN",
					"OAUTH_TOKEN",
					"GH_TOKEN",
					"GITHUB_TOKEN",
				].includes(name)
			)
				delete metadataEnv[name];
		}
		const { stdout } = await execFileAsync(
			"glab",
			["config", "get", "host", "--global"],
			{
				cwd: directory,
				env: metadataEnv,
				timeout: 10_000,
				maxBuffer: 1024,
				signal,
			},
		);
		return stdout.trim();
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function legacyHost(
	deps: GitLabRepositoryDependencies,
	signal: AbortSignal,
): Promise<LegacyGitLabHost> {
	try {
		const env = await (deps.environment ?? getToolEnvironment)();
		checkDeadline(signal);
		for (const name of ["GITLAB_HOST", "GITLAB_URI", "GL_HOST"] as const) {
			if (env[name])
				return { host: authority(env[name]), source: `env:${name}` };
		}
		const value = await (deps.readGlobalHost ?? readGlobalHost)(env, signal);
		checkDeadline(signal);
		return value.trim()
			? { host: authority(value), source: "glab-default" }
			: { host: "gitlab.com", source: "documented-public-default" };
	} catch (error) {
		checkDeadline(signal);
		if (error instanceof Error && "killed" in error && error.killed === true)
			throw new TRPCError({
				code: "TIMEOUT",
				message: "GitLab host metadata lookup timed out.",
			});
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Could not determine GitLab host. Set GITLAB_HOST or install glab and configure its default host.",
		});
	}
}

export async function resolveLegacyGitLabHost(
	deps: GitLabRepositoryDependencies = {},
): Promise<LegacyGitLabHost> {
	return bounded(deps, (signal) => legacyHost(deps, signal));
}

const repositorySchema = z.object({
	id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	path_with_namespace: z
		.string()
		.max(2048)
		.regex(/^[\w.-]+(?:\/[\w.-]+)+$/)
		.refine((value) =>
			value.split("/").every((segment) => segment !== "." && segment !== ".."),
		),
	http_url_to_repo: z.string().max(4096),
});

function limitError(): TRPCError {
	return new TRPCError({
		code: "PRECONDITION_FAILED",
		message:
			"GitLab repository listing exceeds 100 pages or 10,000 projects. Narrow the search using the paginated GitLab repository picker.",
	});
}

function gatewayError(): TRPCError {
	return new TRPCError({
		code: "BAD_GATEWAY",
		message: "Could not load valid GitLab repository information.",
	});
}

async function body(response: Response, signal: AbortSignal): Promise<unknown> {
	if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES) {
		void response.body?.cancel().catch(() => {});
		throw gatewayError();
	}
	const reader = response.body?.getReader();
	if (!reader) throw gatewayError();
	const cancel = () => {
		void reader.cancel().catch(() => {});
	};
	signal.addEventListener("abort", cancel, { once: true });
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			checkDeadline(signal);
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_BODY_BYTES) throw gatewayError();
			chunks.push(value);
		}
		checkDeadline(signal);
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} finally {
		signal.removeEventListener("abort", cancel);
		await reader.cancel();
	}
}

async function capturedToken(
	credentials: Credentials,
	host: string,
	signal: AbortSignal,
): Promise<string> {
	const token = await credentials.getToken(host);
	checkDeadline(signal);
	if (!token)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `No GitLab credential for ${host}. Run glab auth login --hostname ${host} or configure an exact-host Git credential helper.`,
		});
	return token;
}

async function page(
	host: string,
	token: string,
	input: z.output<typeof gitlabRepositoryInputSchema>,
	deps: GitLabRepositoryDependencies,
	signal: AbortSignal,
) {
	checkDeadline(signal);
	const url = new URL(`https://${host}/api/v4/projects`);
	const params = {
		membership: "true",
		order_by: "last_activity_at",
		sort: "desc",
		simple: "true",
		per_page: String(PAGE_SIZE),
		page: String(input.page),
	};
	for (const [key, value] of Object.entries(params))
		url.searchParams.set(key, value);
	if (input.search) url.searchParams.set("search", input.search);
	const response = await (deps.fetch ?? fetch)(url.href, {
		headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
		redirect: "error",
		signal,
	});
	checkDeadline(signal);
	if (!response.ok) {
		void response.body?.cancel().catch(() => {});
		throw new TRPCError({
			code:
				response.status === 401
					? "PRECONDITION_FAILED"
					: response.status === 403
						? "FORBIDDEN"
						: response.status === 429
							? "TOO_MANY_REQUESTS"
							: "BAD_GATEWAY",
			message:
				response.status === 401
					? `GitLab rejected credentials for ${host}. Run glab auth login --hostname ${host} or update its exact-host Git credential helper.`
					: `Could not list GitLab repositories (HTTP ${response.status}).`,
		});
	}
	const raw = await body(response, signal);
	const parsed = z.array(repositorySchema).max(PAGE_SIZE).safeParse(raw);
	if (!parsed.success) throw gatewayError();
	const repositories = parsed.data.map((repository) => {
		const cloneUrl = repository.http_url_to_repo;
		const clone = /^https:\/\/([^/]+)(\/.*)$/.exec(cloneUrl);
		const expectedPath = `/${repository.path_with_namespace}`;
		if (
			!clone?.[1] ||
			authority(clone[1]) !== host ||
			(clone[2] !== `${expectedPath}.git` && clone[2] !== expectedPath)
		)
			throw gatewayError();
		return { fullName: repository.path_with_namespace, cloneUrl };
	});
	const next = response.headers.get("x-next-page");
	let nextPage: number | null;
	if (next === "") nextPage = null;
	else if (next === null)
		nextPage = repositories.length === PAGE_SIZE ? input.page + 1 : null;
	else {
		if (!/^\d+$/.test(next)) throw gatewayError();
		nextPage = Number(next);
		if (!Number.isSafeInteger(nextPage) || nextPage <= input.page)
			throw gatewayError();
	}
	if (nextPage !== null && nextPage > MAX_PAGES) throw limitError();
	return { repositories, nextPage };
}

async function execute<T>(
	deps: GitLabRepositoryDependencies,
	operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	try {
		return await bounded(deps, operation);
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		throw gatewayError();
	}
}

export async function listGitLabRepositoriesForHost(
	credentials: Credentials,
	input: ListingInput,
	deps: GitLabRepositoryDependencies = {},
) {
	const parsed = gitlabRepositoryInputSchema.safeParse(input);
	if (!parsed.success)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid GitLab repository listing request.",
		});
	return execute(deps, async (signal) =>
		page(
			parsed.data.host,
			await capturedToken(credentials, parsed.data.host, signal),
			parsed.data,
			deps,
			signal,
		),
	);
}

export async function listGitLabRepositories(
	credentials: Credentials,
	deps: GitLabRepositoryDependencies = {},
) {
	return execute(deps, async (signal) => {
		const { host } = await legacyHost(deps, signal);
		const token = await capturedToken(credentials, host, signal);
		const repositories: { fullName: string; cloneUrl: string }[] = [];
		for (let current = 1; current <= MAX_PAGES; ) {
			const result = await page(
				host,
				token,
				{ host, page: current, search: undefined },
				deps,
				signal,
			);
			repositories.push(...result.repositories);
			if (repositories.length > 10_000) throw limitError();
			if (result.nextPage === null) return repositories;
			current = result.nextPage;
		}
		throw limitError();
	});
}
