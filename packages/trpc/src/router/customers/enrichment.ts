import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { z } from "zod";

import { env } from "../../env";
import { FREEMAIL_DOMAINS } from "./domain-utils";

/**
 * Automated firmographic enrichment. Two interchangeable backends:
 *
 * - Exa `/search` with `outputSchema` (preferred when EXA_API_KEY is set) —
 *   purpose-built people/company indexes, grounded structured output with
 *   citations in one call. https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 * - Claude + server-side web-search tool (fallback) — no extra vendor.
 *
 * Results are cached for 30 days — each domain/person is researched once,
 * on demand, when someone opens its page.
 */

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Empty results are often search variance — retry them much sooner. */
const EMPTY_RESULT_TTL_SECONDS = 24 * 60 * 60;
const CACHE_PREFIX = `customers:enrich:${env.NODE_ENV}:`;
const isKVConfigured = Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);

const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();

async function getCached<T>(key: string): Promise<T | null> {
	const cacheKey = `${CACHE_PREFIX}${key}`;
	if (isKVConfigured) {
		try {
			const hit = await kv.get<T>(cacheKey);
			if (hit != null) return hit;
		} catch {
			// Fall through to memory cache on KV error
		}
	}
	const entry = memoryCache.get(cacheKey);
	if (!entry || Date.now() > entry.expiresAt) return null;
	return entry.data as T;
}

async function setCache<T>(
	key: string,
	data: T,
	ttlSeconds: number,
): Promise<void> {
	const cacheKey = `${CACHE_PREFIX}${key}`;
	if (isKVConfigured) {
		try {
			await kv.set(cacheKey, data, { ex: ttlSeconds });
			return;
		} catch {
			// Fall through to memory cache on KV error
		}
	}
	memoryCache.set(cacheKey, {
		data,
		expiresAt: Date.now() + ttlSeconds * 1000,
	});
}

function cached<T>(
	key: string,
	fn: () => Promise<T>,
	ttlFor?: (value: T) => number,
): Promise<T> {
	const existing = inFlight.get(key);
	if (existing) return existing as Promise<T>;
	const promise = (async () => {
		const hit = await getCached<T>(key);
		if (hit != null) return hit;
		const fresh = await fn();
		await setCache(key, fresh, ttlFor?.(fresh) ?? CACHE_TTL_SECONDS);
		return fresh;
	})().finally(() => {
		inFlight.delete(key);
	});
	inFlight.set(key, promise);
	return promise;
}

const confidenceSchema = z.enum(["high", "medium", "low"]);
type Confidence = z.infer<typeof confidenceSchema>;

/** Cache-only read — never triggers research. */
export function getCachedDomainEnrichment(
	domain: string,
): Promise<DomainEnrichment | null> {
	return getCached<DomainEnrichment>(`domain:${domain}`);
}

/** Cache-only read — never triggers research. */
export function getCachedPersonEnrichment(
	cacheKey: string,
): Promise<PersonEnrichment | null> {
	return getCached<PersonEnrichment>(`person:v2:${cacheKey}`);
}

/** Cache-only batch read (KV mget) — never triggers research. */
export async function getCachedPersonEnrichmentBatch(
	cacheKeys: string[],
): Promise<Map<string, PersonEnrichment>> {
	const result = new Map<string, PersonEnrichment>();
	if (cacheKeys.length === 0) return result;

	if (isKVConfigured) {
		try {
			const values = await kv.mget<(PersonEnrichment | null)[]>(
				...cacheKeys.map((key) => `${CACHE_PREFIX}person:v2:${key}`),
			);
			cacheKeys.forEach((key, index) => {
				const value = values[index];
				if (value) result.set(key, value);
			});
			return result;
		} catch {
			// Fall through to memory cache on KV error
		}
	}
	for (const key of cacheKeys) {
		const entry = memoryCache.get(`${CACHE_PREFIX}person:v2:${key}`);
		if (entry && Date.now() <= entry.expiresAt) {
			result.set(key, entry.data as PersonEnrichment);
		}
	}
	return result;
}

// ---------------------------------------------------------------------------
// Exa backend
// ---------------------------------------------------------------------------

type ExaGroundingEntry = {
	field?: string;
	citations?: { url?: string; title?: string }[];
	confidence?: string;
};

/**
 * Exa /search with outputSchema: retrieval + grounded structured synthesis in
 * one call. Note: the schema must NOT contain citation/confidence fields —
 * those come back automatically in `output.grounding`.
 */
async function exaStructuredSearch(options: {
	query: string;
	category: "company" | "people";
	systemPrompt: string;
	outputSchema: Record<string, unknown>;
}): Promise<{
	content: unknown;
	sources: string[];
	confidence: Confidence;
} | null> {
	const response = await fetch("https://api.exa.ai/search", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": env.EXA_API_KEY ?? "",
		},
		body: JSON.stringify({
			query: options.query,
			type: "auto",
			category: options.category,
			numResults: 10,
			contents: { highlights: true },
			systemPrompt: options.systemPrompt,
			outputSchema: options.outputSchema,
		}),
	});
	if (!response.ok) {
		throw new Error(
			`Exa API error: ${response.status} - ${await response.text()}`,
		);
	}

	const body = (await response.json()) as {
		output?: { content?: unknown; grounding?: ExaGroundingEntry[] };
	};
	if (body.output?.content == null) return null;

	const grounding = body.output.grounding ?? [];
	const sources = [
		...new Set(
			grounding.flatMap((entry) =>
				(entry.citations ?? []).flatMap((citation) =>
					citation.url ? [citation.url] : [],
				),
			),
		),
	].slice(0, 3);

	// Overall confidence = the most common per-field grounding confidence.
	const counts = new Map<string, number>();
	for (const entry of grounding) {
		if (entry.confidence) {
			counts.set(entry.confidence, (counts.get(entry.confidence) ?? 0) + 1);
		}
	}
	const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
	const confidence = confidenceSchema.catch("low").parse(top ?? "low");

	return { content: body.output.content, sources, confidence };
}

// ---------------------------------------------------------------------------
// Claude web-search backend (fallback)
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/**
 * One research call: Claude + server-side web search, JSON answer in the
 * final text. `pause_turn` means the server-side tool loop hit its iteration
 * limit — resend to let it resume.
 */
async function runResearch(prompt: string): Promise<string> {
	// Local dev worktrees often carry a placeholder key — fail with a clear
	// message instead of a cryptic 401.
	if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY.length < 20) {
		throw new Error(
			"ANTHROPIC_API_KEY is not configured (placeholder value) — set a real key in .env to enable AI enrichment",
		);
	}

	let messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
	for (let attempt = 0; attempt < 4; attempt++) {
		const response = await anthropic.messages.create({
			model: "claude-opus-4-8",
			max_tokens: 16000,
			tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
			messages,
		});
		if (response.stop_reason === "pause_turn") {
			messages = [
				...messages,
				{ role: "assistant", content: response.content },
			];
			continue;
		}
		return response.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n");
	}
	throw new Error("Web research did not complete");
}

function extractJson(text: string): unknown {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end <= start) return null;
	try {
		return JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Domain enrichment
// ---------------------------------------------------------------------------

const domainFieldsSchema = z.object({
	companyName: z.string().nullable().catch(null),
	description: z.string().nullable().catch(null),
	employeeRange: z.string().nullable().catch(null),
	stage: z.string().nullable().catch(null),
	industry: z.string().nullable().catch(null),
	headquarters: z.string().nullable().catch(null),
});

export type DomainEnrichment = z.infer<typeof domainFieldsSchema> & {
	domain: string;
	confidence: Confidence;
	sources: string[];
	fetchedAt: string;
};

const EMPTY_DOMAIN_FIELDS: z.infer<typeof domainFieldsSchema> = {
	companyName: null,
	description: null,
	employeeRange: null,
	stage: null,
	industry: null,
	headquarters: null,
};

const EMPLOYEE_RANGES =
	'"1-10", "11-50", "51-200", "201-1000", "1001-5000", "5000+"';
const STAGES =
	'"bootstrapped", "pre-seed", "seed", "series-a", "series-b", "series-c+", "public", "subsidiary", "nonprofit"';

const EXA_DOMAIN_SCHEMA = {
	type: "object",
	description: "Verified facts about the company that owns the domain",
	required: [],
	properties: {
		companyName: { type: "string", description: "Official company name" },
		description: {
			type: "string",
			description: "One sentence on what the company does",
		},
		employeeRange: {
			type: "string",
			description: `Employee count bucket — exactly one of: ${EMPLOYEE_RANGES}`,
		},
		stage: {
			type: "string",
			description: `Company stage — exactly one of: ${STAGES}`,
		},
		industry: {
			type: "string",
			description: "Short industry label, e.g. developer tools",
		},
		headquarters: { type: "string", description: "City, country" },
	},
};

export function getDomainEnrichment(domain: string): Promise<DomainEnrichment> {
	return cached(
		`domain:${domain}`,
		async () => {
			const base = { domain, fetchedAt: new Date().toISOString() };
			if (FREEMAIL_DOMAINS.has(domain)) {
				return {
					...base,
					...EMPTY_DOMAIN_FIELDS,
					confidence: "low" as const,
					sources: [],
				};
			}

			if (env.EXA_API_KEY) {
				const result = await exaStructuredSearch({
					query: `company with the website domain ${domain}`,
					category: "company",
					systemPrompt:
						"Identify the company that owns the given domain. Prefer official sources (the company's own site, LinkedIn company page, Crunchbase). Only report facts you can verify from the sources; omit anything uncertain.",
					outputSchema: EXA_DOMAIN_SCHEMA,
				});
				const fields = domainFieldsSchema.safeParse(result?.content ?? {});
				return {
					...base,
					...(fields.success ? fields.data : EMPTY_DOMAIN_FIELDS),
					confidence: result?.confidence ?? "low",
					sources: result?.sources ?? [],
				};
			}

			const text = await runResearch(
				`Research the company that owns the domain "${domain}". Use web search.

Respond with ONLY a single JSON object — no markdown fences, no prose before or after — with exactly these fields:
{
  "companyName": string | null,
  "description": string | null,        // one sentence on what the company does
  "employeeRange": ${EMPLOYEE_RANGES.replaceAll(", ", " | ")} | null,
  "stage": ${STAGES.replaceAll(", ", " | ")} | null,
  "industry": string | null,           // short, e.g. "developer tools"
  "headquarters": string | null,       // city, country
  "confidence": "high" | "medium" | "low",
  "sources": string[]                  // up to 3 source URLs
}
Use null for anything you cannot verify. If the domain is a personal email provider, parked, or unidentifiable, return all-null fields with confidence "low".`,
			);

			const parsed = domainFieldsSchema
				.extend({
					confidence: confidenceSchema.catch("low"),
					sources: z.array(z.string()).catch([]),
				})
				.safeParse(extractJson(text));
			return {
				...base,
				...(parsed.success
					? parsed.data
					: {
							...EMPTY_DOMAIN_FIELDS,
							confidence: "low" as const,
							sources: [],
						}),
			};
		},
		(value) =>
			value.companyName || value.description
				? CACHE_TTL_SECONDS
				: EMPTY_RESULT_TTL_SECONDS,
	);
}

// ---------------------------------------------------------------------------
// Person enrichment
// ---------------------------------------------------------------------------

const personFieldsSchema = z.object({
	title: z.string().nullable().catch(null),
	seniority: z
		.enum(["founder", "exec", "manager", "ic"])
		.nullable()
		.catch(null),
	linkedinUrl: z.string().nullable().catch(null),
	twitterUrl: z.string().nullable().catch(null),
	githubUrl: z.string().nullable().catch(null),
	websiteUrl: z.string().nullable().catch(null),
});

export type PersonEnrichment = z.infer<typeof personFieldsSchema> & {
	confidence: Confidence;
	sources: string[];
	fetchedAt: string;
};

const EMPTY_PERSON_FIELDS: z.infer<typeof personFieldsSchema> = {
	title: null,
	seniority: null,
	linkedinUrl: null,
	twitterUrl: null,
	githubUrl: null,
	websiteUrl: null,
};

const EXA_PERSON_SCHEMA = {
	type: "object",
	description: "Verified facts about this specific person",
	required: [],
	properties: {
		title: {
			type: "string",
			description: 'Current job title, e.g. "CTO", "Senior Software Engineer"',
		},
		seniority: {
			type: "string",
			description:
				'Seniority bucket — exactly one of: "founder", "exec", "manager", "ic"',
		},
		linkedinUrl: {
			type: "string",
			description: "URL of their LinkedIn profile",
		},
		twitterUrl: {
			type: "string",
			description: "URL of their Twitter/X profile",
		},
		githubUrl: {
			type: "string",
			description: "URL of their GitHub profile",
		},
		websiteUrl: {
			type: "string",
			description: "URL of their personal website or blog",
		},
	},
};

export function getPersonEnrichment(options: {
	cacheKey: string;
	name: string;
	domain: string;
}): Promise<PersonEnrichment> {
	// v2: added twitter/github/website fields — old cache entries lack them.
	return cached(
		`person:v2:${options.cacheKey}`,
		async () => {
			const base = { fetchedAt: new Date().toISOString() };
			const isFreemail = FREEMAIL_DOMAINS.has(options.domain);

			if (env.EXA_API_KEY) {
				const result = await exaStructuredSearch({
					query: isFreemail
						? `${options.name}, software professional`
						: `${options.name}, who works at the company with the domain ${options.domain}`,
					category: "people",
					systemPrompt:
						"Identify this specific person — the name (and employer domain, when given) must match. Prefer LinkedIn profiles, company team pages, and GitHub. Include their social profiles (LinkedIn, Twitter/X, GitHub, personal site) when clearly theirs. If you cannot confidently match this exact person, return an empty object; never report another person's details.",
					outputSchema: EXA_PERSON_SCHEMA,
				});
				const fields = personFieldsSchema.safeParse(result?.content ?? {});
				return {
					...base,
					...(fields.success ? fields.data : EMPTY_PERSON_FIELDS),
					confidence: result?.confidence ?? "low",
					sources: result?.sources ?? [],
				};
			}

			const companyHint = isFreemail
				? "Their email is on a personal provider, so no company is known."
				: `They signed up with an email at "${options.domain}", so they likely work at the company owning that domain.`;

			const text = await runResearch(
				`Find the current job title and public social profiles of a software professional named "${options.name}". ${companyHint} Use web search (LinkedIn, Twitter/X, GitHub, company team pages, conference bios).

Respond with ONLY a single JSON object — no markdown fences, no prose — with exactly these fields:
{
  "title": string | null,              // e.g. "CTO", "Senior Software Engineer"
  "seniority": "founder" | "exec" | "manager" | "ic" | null,
  "linkedinUrl": string | null,        // their LinkedIn profile URL
  "twitterUrl": string | null,         // their Twitter/X profile URL
  "githubUrl": string | null,          // their GitHub profile URL
  "websiteUrl": string | null,         // their personal website or blog
  "confidence": "high" | "medium" | "low",
  "sources": string[]                  // up to 3 source URLs
}
Only report fields you are reasonably sure belong to THIS person (name AND company/domain match). If you cannot confidently identify them, return all-null fields with confidence "low". Never guess or attribute another person's profiles.`,
			);

			const parsed = personFieldsSchema
				.extend({
					confidence: confidenceSchema.catch("low"),
					sources: z.array(z.string()).catch([]),
				})
				.safeParse(extractJson(text));
			return {
				...base,
				...(parsed.success
					? parsed.data
					: {
							...EMPTY_PERSON_FIELDS,
							confidence: "low" as const,
							sources: [],
						}),
			};
		},
		(value) =>
			value.title ||
			value.linkedinUrl ||
			value.twitterUrl ||
			value.githubUrl ||
			value.websiteUrl
				? CACHE_TTL_SECONDS
				: EMPTY_RESULT_TTL_SECONDS,
	);
}
