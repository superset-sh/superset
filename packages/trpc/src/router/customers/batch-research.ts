import { getDomainEnrichment, getPersonEnrichment } from "./enrichment";
import { setDomainResearchProgress } from "./research-settings";

/**
 * One-shot background research batch for a domain: the company plus a list
 * of its users, with bounded concurrency. Progress is persisted so the UI
 * can poll it. Runs within this server process — on serverless it may be cut
 * short; a QStash job is the durable upgrade if that becomes a problem.
 */

// Exa comfortably handles this in parallel (~2s/lookup) — a 200-person
// batch completes in under a minute.
const CONCURRENCY = 8;
const runningDomains = new Set<string>();

export interface BatchResearchTarget {
	id: string;
	name: string;
	email: string;
}

export function isDomainResearchRunning(domain: string): boolean {
	return runningDomains.has(domain);
}

/** Returns the number of people queued (0 if a batch is already running). */
export function startDomainResearchBatch(options: {
	domain: string;
	users: BatchResearchTarget[];
	includeCompany: boolean;
}): number {
	const { domain, users, includeCompany } = options;
	if (runningDomains.has(domain)) return 0;
	if (users.length === 0 && !includeCompany) return 0;
	runningDomains.add(domain);

	const startedAt = new Date().toISOString();
	const total = users.length;

	void (async () => {
		try {
			await setDomainResearchProgress(domain, {
				total,
				done: 0,
				startedAt,
				finishedAt: null,
			});

			if (includeCompany) {
				await getDomainEnrichment(domain).catch(() => {});
			}

			let done = 0;
			const queue = [...users];
			await Promise.all(
				Array.from({ length: CONCURRENCY }, async () => {
					for (;;) {
						const user = queue.shift();
						if (!user) return;
						const userDomain = user.email.split("@")[1]?.toLowerCase() ?? "";
						await getPersonEnrichment({
							cacheKey: user.id,
							name: user.name,
							domain: userDomain,
						}).catch(() => {});
						done += 1;
						await setDomainResearchProgress(domain, {
							total,
							done,
							startedAt,
							finishedAt: null,
						});
					}
				}),
			);

			await setDomainResearchProgress(domain, {
				total,
				done: total,
				startedAt,
				finishedAt: new Date().toISOString(),
			});
		} finally {
			runningDomains.delete(domain);
		}
	})();

	return total;
}
