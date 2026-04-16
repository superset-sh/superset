import type {
	BuildLaunchContextInputs,
	ContextSection,
	ContributorRegistry,
	LaunchContext,
	LaunchSource,
	LaunchSourceKind,
	ResolveCtx,
} from "./types";

export const CONTRIBUTOR_TIMEOUT_MS = 10_000;

/**
 * Order sections are grouped into when no consumer overrides. Matches the
 * rendering order used by agent prompt templates.
 */
const KIND_ORDER: readonly LaunchSourceKind[] = [
	"user-prompt",
	"internal-task",
	"github-issue",
	"github-pr",
	"attachment",
] as const;

export interface BuildLaunchContextDeps {
	contributors: ContributorRegistry;
	resolveCtx: ResolveCtx;
	timeoutMs?: number;
}

export async function buildLaunchContext(
	inputs: BuildLaunchContextInputs,
	deps: BuildLaunchContextDeps,
): Promise<LaunchContext> {
	const timeoutMs = deps.timeoutMs ?? CONTRIBUTOR_TIMEOUT_MS;
	const deduped = dedupeSources(inputs.sources);
	const resolutions = await Promise.all(
		deduped.map((source) =>
			resolveOne(source, deps.contributors, deps.resolveCtx, timeoutMs),
		),
	);

	const sections: ContextSection[] = [];
	const failures: LaunchContext["failures"] = [];
	for (let i = 0; i < deduped.length; i++) {
		const result = resolutions[i];
		const source = deduped[i];
		if (!result || !source) continue;
		if (result.kind === "section" && result.section) {
			sections.push(result.section);
		} else if (result.kind === "error") {
			failures.push({ source, error: result.error });
		}
	}

	sections.sort((a, b) => kindRank(a.kind) - kindRank(b.kind));

	return {
		projectId: inputs.projectId,
		sources: deduped,
		sections,
		failures,
		taskSlug: deriveTaskSlug(sections),
		agent: inputs.agent,
	};
}

type ResolveResult =
	| { kind: "section"; section: ContextSection | null }
	| { kind: "error"; error: string };

async function resolveOne(
	source: LaunchSource,
	contributors: ContributorRegistry,
	resolveCtx: ResolveCtx,
	timeoutMs: number,
): Promise<ResolveResult> {
	const contributor = contributors[source.kind] as
		| ContributorRegistry[LaunchSourceKind]
		| undefined;
	if (!contributor) {
		return { kind: "error", error: `No contributor for kind ${source.kind}` };
	}

	try {
		const section = await withTimeout(
			// biome-ignore lint/suspicious/noExplicitAny: registry dispatch is verified by discriminated kind above
			contributor.resolve(source as any, resolveCtx),
			timeoutMs,
		);
		return { kind: "section", section };
	} catch (err) {
		return {
			kind: "error",
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Contributor timeout after ${timeoutMs}ms`)),
			timeoutMs,
		);
	});
	return Promise.race([promise, timeout]).finally(() => {
		if (timer) clearTimeout(timer);
	}) as Promise<T>;
}

function kindRank(kind: LaunchSourceKind): number {
	const idx = KIND_ORDER.indexOf(kind);
	return idx === -1 ? KIND_ORDER.length : idx;
}

/**
 * Kind-specific identity: URL/id-based kinds dedup on their identifier.
 * Attachments never dedup — users dragging N files mean N files.
 */
function sourceIdentity(source: LaunchSource): string | null {
	switch (source.kind) {
		case "user-prompt":
			return "user-prompt";
		case "github-issue":
			return `github-issue:${source.url}`;
		case "github-pr":
			return `github-pr:${source.url}`;
		case "internal-task":
			return `internal-task:${source.id}`;
		case "attachment":
			return null; // never dedup
	}
}

function dedupeSources(sources: LaunchSource[]): LaunchSource[] {
	const seen = new Set<string>();
	const out: LaunchSource[] = [];
	for (const source of sources) {
		const id = sourceIdentity(source);
		if (id === null) {
			out.push(source);
			continue;
		}
		if (seen.has(id)) continue;
		seen.add(id);
		out.push(source);
	}
	return out;
}

function deriveTaskSlug(sections: ContextSection[]): string | undefined {
	const firstTask = sections.find((s) => s.kind === "internal-task");
	if (firstTask?.meta?.taskSlug) return firstTask.meta.taskSlug;
	const firstIssue = sections.find((s) => s.kind === "github-issue");
	if (firstIssue?.meta?.taskSlug) return firstIssue.meta.taskSlug;
	return undefined;
}
