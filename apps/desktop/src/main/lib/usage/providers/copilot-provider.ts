import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderSnapshot } from "../usage-snapshot";
import { emptySnapshot, ProviderCollector } from "./base-provider";
import { decodeJwtPayload, readJsonFile } from "./credentials";

const HOSTS_PATH = join(homedir(), ".config", "github-copilot", "hosts.json");
const APPS_PATH = join(homedir(), ".config", "github-copilot", "apps.json");
const TOKEN_ENDPOINT = "https://api.github.com/copilot_internal/v2/token";

type CopilotHosts = Record<string, { oauth_token?: string } | undefined>;

interface CopilotTokenResponse {
	token?: string;
	expires_at?: number;
}

async function resolveOauthToken(): Promise<string | null> {
	for (const path of [HOSTS_PATH, APPS_PATH]) {
		const hosts = await readJsonFile<CopilotHosts>(path);
		if (!hosts) continue;
		for (const entry of Object.values(hosts)) {
			if (entry?.oauth_token) return entry.oauth_token;
		}
	}
	return null;
}

function planFromToken(token: string): string | null {
	const payload = decodeJwtPayload(token);
	const sku = payload?.sku ?? payload?.copilot_plan;
	if (typeof sku !== "string") return null;
	return sku.replace(/_/g, " ").toUpperCase();
}

export class CopilotProvider extends ProviderCollector {
	readonly providerId = "copilot" as const;

	protected async fetchSnapshot(): Promise<ProviderSnapshot> {
		const oauthToken = await resolveOauthToken();
		if (!oauthToken) {
			return emptySnapshot(this.providerId, "no-credentials");
		}

		const response = await this.fetchWithTimeout(TOKEN_ENDPOINT, {
			headers: {
				authorization: `token ${oauthToken}`,
				accept: "application/json",
			},
		});

		if (!response.ok) {
			return emptySnapshot(this.providerId, "auth-error", {
				errorMessage: "Session expired — re-authenticate the Copilot CLI.",
			});
		}

		const body = (await response.json()) as CopilotTokenResponse;
		return emptySnapshot(this.providerId, "ok", {
			planLabel: body.token ? planFromToken(body.token) : null,
		});
	}
}
