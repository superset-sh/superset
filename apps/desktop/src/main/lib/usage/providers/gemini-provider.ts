import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ProviderSnapshot } from "../usage-snapshot";
import { emptySnapshot, ProviderCollector } from "./base-provider";
import { readJsonFile, whichBinary } from "./credentials";

const CREDS_PATH = join(homedir(), ".gemini", "oauth_creds.json");

interface GeminiCreds {
	access_token?: string;
	client_id?: string;
}

interface OAuthClientFile {
	client_id?: string;
	installed?: { client_id?: string };
	web?: { client_id?: string };
}

/**
 * The OAuth client id must never be hardcoded — it belongs to the installed
 * gemini-cli. Resolve it from the binary's bundled config, then fall back to
 * the id recorded in the user's own creds file.
 */
async function resolveClientId(creds: GeminiCreds): Promise<string | null> {
	for (const name of ["gemini", "gemini-cli"]) {
		const binary = await whichBinary(name);
		if (!binary) continue;
		const candidate = join(
			dirname(binary),
			"..",
			"lib",
			"node_modules",
			"@google",
			"generative-ai-cli",
			"oauth-client.json",
		);
		const file = await readJsonFile<OAuthClientFile>(candidate);
		const clientId =
			file?.client_id ?? file?.installed?.client_id ?? file?.web?.client_id;
		if (clientId) return clientId;
	}
	return creds.client_id ?? null;
}

export class GeminiProvider extends ProviderCollector {
	readonly providerId = "gemini" as const;

	protected async fetchSnapshot(): Promise<ProviderSnapshot> {
		const creds = await readJsonFile<GeminiCreds>(CREDS_PATH);
		if (!creds?.access_token) {
			return emptySnapshot(this.providerId, "no-credentials", {
				errorMessage: "Not signed in — log in via the Gemini CLI to see usage.",
			});
		}

		const clientId = await resolveClientId(creds);
		if (!clientId) {
			return emptySnapshot(this.providerId, "auth-error", {
				errorMessage:
					"Could not resolve Gemini OAuth client — ensure gemini-cli is installed.",
			});
		}

		// Gemini exposes no documented quota headers on an unauthenticated probe;
		// mark the session healthy and leave windows empty until one is available.
		return emptySnapshot(this.providerId, "ok");
	}
}
