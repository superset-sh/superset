import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	API_BILLING_MARKER,
	discoverClaudeProfiles,
	discoverCodexHomes,
} from "../profiles";

export interface SessionAccount {
	agent: "claude" | "codex";
	selection: string | null;
	credentialKind: "subscription" | "api_key";
	identity: string;
	directory?: string;
	email?: string;
}

async function hasApiMarker(
	agent: string,
	directory: string,
): Promise<boolean> {
	try {
		const file = join(directory, API_BILLING_MARKER);
		if ((await stat(file)).size > 64) return false;
		return (await readFile(file, "utf8")).trim() === agent;
	} catch {
		return false;
	}
}

async function canonical(path: string) {
	return realpath(path).catch(() => resolve(path));
}

export async function readAccountIdentity(
	agent: "claude" | "codex",
	directory: string,
): Promise<{ identity: string; email: string } | null> {
	try {
		const file =
			agent === "codex"
				? join(directory, "auth.json")
				: (await canonical(directory)) ===
						(await canonical(join(homedir(), ".claude")))
					? join(homedir(), ".claude.json")
					: join(directory, ".claude.json");
		if ((await stat(file)).size > 50 * 1024 * 1024) return null;
		const data = JSON.parse(await readFile(file, "utf8"));
		const claims =
			agent === "codex" && typeof data.tokens?.id_token === "string"
				? JSON.parse(
						Buffer.from(
							data.tokens.id_token.split(".")[1],
							"base64url",
						).toString("utf8"),
					)
				: null;
		const id =
			agent === "claude"
				? data.oauthAccount?.accountUuid
				: data.tokens?.account_id;
		const email =
			agent === "claude" ? data.oauthAccount?.emailAddress : claims?.email;
		if (typeof id !== "string" || !id || typeof email !== "string" || !email)
			return null;
		if (agent === "codex" && typeof claims?.sub !== "string") return null;
		return {
			identity: createHash("sha256")
				.update(JSON.stringify([id, claims?.sub, email]))
				.digest("hex"),
			email,
		};
	} catch {
		return null;
	}
}

export async function captureSessionAccount(
	agent: string | undefined,
	profile: string,
	apiKey: boolean,
): Promise<SessionAccount | undefined> {
	if (agent !== "claude" && agent !== "codex") return undefined;
	if (apiKey)
		return {
			agent,
			selection: null,
			credentialKind: "api_key",
			identity: "api-env",
		};

	const profiles =
		agent === "claude"
			? [
					{
						directory: join(homedir(), ".claude"),
						selection: null,
						credentialKind: (await hasApiMarker(
							"claude",
							join(homedir(), ".claude"),
						))
							? ("api_key" as const)
							: ("subscription" as const),
					},
					...(await discoverClaudeProfiles()).map((p) => ({
						directory: p.configDir,
						selection: p.configDir,
						credentialKind: p.credentialKind,
					})),
				]
			: (await discoverCodexHomes()).map((p, index) => ({
					directory: p.home,
					selection: index === 0 ? null : p.home,
					credentialKind: p.credentialKind,
				}));
	const directory = await canonical(profile || profiles[0]?.directory || "");
	for (const candidate of profiles) {
		if ((await canonical(candidate.directory)) !== directory) continue;
		if (candidate.credentialKind === "api_key")
			return {
				agent,
				selection: candidate.selection,
				credentialKind: "api_key",
				identity: "api-profile",
			};
		const identity = await readAccountIdentity(agent, candidate.directory);
		if (identity)
			return {
				agent,
				selection: candidate.selection,
				credentialKind: "subscription",
				...identity,
				directory: candidate.directory,
			};
	}
	return undefined;
}

export async function validateSessionAccount(
	snapshot: SessionAccount,
): Promise<boolean> {
	if (snapshot.credentialKind === "api_key") return true;
	if (
		!snapshot.directory ||
		(await hasApiMarker(snapshot.agent, snapshot.directory))
	)
		return false;
	const current = await readAccountIdentity(snapshot.agent, snapshot.directory);
	return current?.identity === snapshot.identity;
}
