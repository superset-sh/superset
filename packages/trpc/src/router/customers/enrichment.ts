import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { z } from "zod";

import { env } from "../../env";
import { FREEMAIL_DOMAINS } from "./domain-utils";

/**
 * Automated firmographic enrichment: one Claude call with the server-side
 * web-search tool researches a domain (or a person) and returns structured
 * facts. Results are cached for 30 days — each domain/person is researched
 * once, on demand, when someone opens its page.
 */

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
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

async function setCache<T>(key: string, data: T): Promise<void> {
	const cacheKey = `${CACHE_PREFIX}${key}`;
	if (isKVConfigured) {
		try {
			await kv.set(cacheKey, data, { ex: CACHE_TTL_SECONDS });
			return;
		} catch {
			// Fall through to memory cache on KV error
		}
	}
	memoryCache.set(cacheKey, {
		data,
		expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
	});
}

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const existing = inFlight.get(key);
	if (existing) return existing as Promise<T>;
	const promise = (async () => {
		const hit = await getCached<T>(key);
		if (hit != null) return hit;
		const fresh = await fn();
		await setCache(key, fresh);
		return fresh;
	})().finally(() => {
		inFlight.delete(key);
	});
	inFlight.set(key, promise);
	return promise;
}

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

const confidenceSchema = z.enum(["high", "medium", "low"]);

const domainEnrichmentSchema = z.object({
	companyName: z.string().nullable().catch(null),
	description: z.string().nullable().catch(null),
	employeeRange: z.string().nullable().catch(null),
	stage: z.string().nullable().catch(null),
	industry: z.string().nullable().catch(null),
	headquarters: z.string().nullable().catch(null),
	confidence: confidenceSchema.catch("low"),
	sources: z.array(z.string()).catch([]),
});

export type DomainEnrichment = z.infer<typeof domainEnrichmentSchema> & {
	domain: string;
	fetchedAt: string;
};

const EMPTY_DOMAIN_FIELDS = {
	companyName: null,
	description: null,
	employeeRange: null,
	stage: null,
	industry: null,
	headquarters: null,
	confidence: "low" as const,
	sources: [],
};

export function getDomainEnrichment(domain: string): Promise<DomainEnrichment> {
	return cached(`domain:${domain}`, async () => {
		if (FREEMAIL_DOMAINS.has(domain)) {
			return {
				domain,
				fetchedAt: new Date().toISOString(),
				...EMPTY_DOMAIN_FIELDS,
			};
		}

		const text = await runResearch(
			`Research the company that owns the domain "${domain}". Use web search.

Respond with ONLY a single JSON object — no markdown fences, no prose before or after — with exactly these fields:
{
  "companyName": string | null,
  "description": string | null,        // one sentence on what the company does
  "employeeRange": "1-10" | "11-50" | "51-200" | "201-1000" | "1001-5000" | "5000+" | null,
  "stage": "bootstrapped" | "pre-seed" | "seed" | "series-a" | "series-b" | "series-c+" | "public" | "subsidiary" | "nonprofit" | null,
  "industry": string | null,           // short, e.g. "developer tools"
  "headquarters": string | null,       // city, country
  "confidence": "high" | "medium" | "low",
  "sources": string[]                  // up to 3 source URLs
}
Use null for anything you cannot verify. If the domain is a personal email provider, parked, or unidentifiable, return all-null fields with confidence "low".`,
		);

		const parsed = domainEnrichmentSchema.safeParse(extractJson(text));
		return {
			domain,
			fetchedAt: new Date().toISOString(),
			...(parsed.success ? parsed.data : EMPTY_DOMAIN_FIELDS),
		};
	});
}

const personEnrichmentSchema = z.object({
	title: z.string().nullable().catch(null),
	seniority: z
		.enum(["founder", "exec", "manager", "ic"])
		.nullable()
		.catch(null),
	linkedinUrl: z.string().nullable().catch(null),
	confidence: confidenceSchema.catch("low"),
	sources: z.array(z.string()).catch([]),
});

export type PersonEnrichment = z.infer<typeof personEnrichmentSchema> & {
	fetchedAt: string;
};

export function getPersonEnrichment(options: {
	cacheKey: string;
	name: string;
	domain: string;
}): Promise<PersonEnrichment> {
	return cached(`person:${options.cacheKey}`, async () => {
		const companyHint = FREEMAIL_DOMAINS.has(options.domain)
			? "Their email is on a personal provider, so no company is known."
			: `They signed up with an email at "${options.domain}", so they likely work at the company owning that domain.`;

		const text = await runResearch(
			`Find the current job title of a software professional named "${options.name}". ${companyHint} Use web search (LinkedIn, company team pages, GitHub, conference bios).

Respond with ONLY a single JSON object — no markdown fences, no prose — with exactly these fields:
{
  "title": string | null,              // e.g. "CTO", "Senior Software Engineer"
  "seniority": "founder" | "exec" | "manager" | "ic" | null,
  "linkedinUrl": string | null,
  "confidence": "high" | "medium" | "low",
  "sources": string[]                  // up to 3 source URLs
}
Only report a title if you are reasonably sure it is THIS person (name AND company/domain match). If you cannot confidently identify them, return all-null fields with confidence "low". Never guess.`,
		);

		const parsed = personEnrichmentSchema.safeParse(extractJson(text));
		return {
			fetchedAt: new Date().toISOString(),
			...(parsed.success
				? parsed.data
				: {
						title: null,
						seniority: null,
						linkedinUrl: null,
						confidence: "low" as const,
						sources: [],
					}),
		};
	});
}
