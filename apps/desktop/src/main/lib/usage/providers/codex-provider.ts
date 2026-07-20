import { homedir } from "node:os";
import { join } from "node:path";
import { parseCodexLogs } from "../log-parsers/codex-log-parser";
import type { ProviderSnapshot } from "../usage-snapshot";
import { emptySnapshot, ProviderCollector } from "./base-provider";
import { decodeJwtPayload, readJsonFile } from "./credentials";

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

		// OpenAI does not expose a documented subscription rate-limit endpoint;
		// surface identity + locally-estimated cost until one is available.
		return emptySnapshot(this.providerId, "ok", {
			cost,
			email: extractEmail(auth),
			planLabel: extractPlan(auth),
		});
	}
}
