import { kv } from "@vercel/kv";

import { env } from "../../env";

/**
 * Per-domain research mode. Default is manual (research only when a human
 * clicks); auto means the whole domain — company + every user — is researched
 * proactively and cached. Stored in KV (no TTL); in-memory fallback for dev.
 */

export interface DomainResearchSettings {
	autoResearch: boolean;
}

const DEFAULT_SETTINGS: DomainResearchSettings = { autoResearch: false };

const PREFIX = `customers:research-settings:${env.NODE_ENV}:domain:`;
const isKVConfigured = Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
const memorySettings = new Map<string, DomainResearchSettings>();

export async function getDomainResearchSettings(
	domain: string,
): Promise<DomainResearchSettings> {
	if (isKVConfigured) {
		try {
			const stored = await kv.get<DomainResearchSettings>(`${PREFIX}${domain}`);
			if (stored) return stored;
		} catch {
			// Fall through to memory on KV error
		}
	}
	return memorySettings.get(domain) ?? DEFAULT_SETTINGS;
}

export async function setDomainResearchSettings(
	domain: string,
	settings: DomainResearchSettings,
): Promise<void> {
	if (isKVConfigured) {
		try {
			await kv.set(`${PREFIX}${domain}`, settings);
			return;
		} catch {
			// Fall through to memory on KV error
		}
	}
	memorySettings.set(domain, settings);
}

/** Live status of a domain's background research batch. */
export interface DomainResearchProgress {
	total: number;
	done: number;
	startedAt: string;
	finishedAt: string | null;
}

const PROGRESS_PREFIX = `customers:research-progress:${env.NODE_ENV}:domain:`;
const PROGRESS_TTL_SECONDS = 24 * 60 * 60;
const memoryProgress = new Map<string, DomainResearchProgress>();

export async function getDomainResearchProgress(
	domain: string,
): Promise<DomainResearchProgress | null> {
	if (isKVConfigured) {
		try {
			const stored = await kv.get<DomainResearchProgress>(
				`${PROGRESS_PREFIX}${domain}`,
			);
			if (stored) return stored;
		} catch {
			// Fall through to memory on KV error
		}
	}
	return memoryProgress.get(domain) ?? null;
}

export async function setDomainResearchProgress(
	domain: string,
	progress: DomainResearchProgress,
): Promise<void> {
	if (isKVConfigured) {
		try {
			await kv.set(`${PROGRESS_PREFIX}${domain}`, progress, {
				ex: PROGRESS_TTL_SECONDS,
			});
			return;
		} catch {
			// Fall through to memory on KV error
		}
	}
	memoryProgress.set(domain, progress);
}
