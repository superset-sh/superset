import { homedir } from "node:os";
import { join } from "node:path";
import { parseCodexLogs } from "../log-parsers/codex-log-parser";
import type {
	ProviderCredits,
	ProviderSnapshot,
	RateLimitWindow,
} from "../usage-snapshot";
import { emptySnapshot, ProviderCollector } from "./base-provider";
import {
	type CodexWindow,
	labelForWindowMinutes,
	readLatestCodexRateLimits,
} from "./codex-rate-limits";
import { decodeJwtPayload, readJsonFile } from "./credentials";
import { buildWindow } from "./window-pace";

const AUTH_PATH = join(homedir(), ".codex", "auth.json");

interface CodexAuth {
	tokens?: { access_token?: string; id_token?: string };
	access_token?: string;
	OPENAI_API_KEY?: string;
}

function extractEmail(auth: CodexAuth): string | null {
	const idToken = auth.tokens?.id_token;
	if (!idToken) return null;
	const payload = decodeJwtPayload(idToken);
	const email = payload?.email;
	return typeof email === "string" ? email : null;
}

function extractPlan(auth: CodexAuth): string | null {
	const idToken = auth.tokens?.id_token;
	if (!idToken) return null;
	const payload = decodeJwtPayload(idToken);
	const auth0 = payload?.["https://api.openai.com/auth"];
	if (typeof auth0 !== "object" || auth0 === null) return null;
	const plan = (auth0 as Record<string, unknown>).chatgpt_plan_type;
	return typeof plan === "string" ? plan.toUpperCase() : null;
}

function toWindow(window: CodexWindow): RateLimitWindow {
	return buildWindow({
		label: labelForWindowMinutes(window.windowMinutes),
		usedPct: window.usedPercent,
		resetAt: window.resetsAt ? new Date(window.resetsAt * 1000) : null,
		windowMs: window.windowMinutes * 60 * 1000,
	});
}

export class CodexProvider extends ProviderCollector {
	readonly providerId = "codex" as const;

	protected async fetchSnapshot(): Promise<ProviderSnapshot> {
		const auth = await readJsonFile<CodexAuth>(AUTH_PATH);
		const cost = await parseCodexLogs();

		const hasToken = Boolean(
			auth?.tokens?.access_token ?? auth?.access_token ?? auth?.OPENAI_API_KEY,
		);
		if (!auth || !hasToken) {
			return emptySnapshot(this.providerId, "no-credentials", { cost });
		}

		// Codex writes its subscription rate-limit snapshot into rollout session
		// logs, so we read it passively rather than probing the backend.
		const rateLimits = await readLatestCodexRateLimits();
		const windows: RateLimitWindow[] = [];
		if (rateLimits?.primary) windows.push(toWindow(rateLimits.primary));
		if (rateLimits?.secondary) windows.push(toWindow(rateLimits.secondary));

		const credits: ProviderCredits | null =
			rateLimits?.creditBalance != null
				? { balance: rateLimits.creditBalance, resetCredits: 0 }
				: null;

		return emptySnapshot(this.providerId, "ok", {
			cost,
			email: extractEmail(auth),
			planLabel: rateLimits?.planType?.toUpperCase() ?? extractPlan(auth),
			windows,
			credits,
		});
	}
}
