import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { readProfileFile } from "../profile-file";
import {
	API_BILLING_MARKER,
	discoverClaudeProfiles,
	discoverCodexHomes,
} from "../profiles";

export interface SessionAccount {
	/** Explicit launch selection; an observed account alone is not a pin. */
	pinned?: true;
	/** A same-launch hook reported another login; automatic recovery is refused. */
	conflict?: true;
	agent: "claude" | "codex";
	selection: string | null;
	credentialKind: "subscription" | "api_key";
	identity: string;
	directory?: string;
	email?: string;
}

const persistedAccountSchema = z
	.object({
		agent: z.enum(["claude", "codex"]),
		selection: z.string().nullable(),
		credentialKind: z.enum(["subscription", "api_key"]),
		identity: z.string().min(1),
		directory: z.string().optional(),
		email: z.string().optional(),
		pinned: z.literal(true).optional(),
		conflict: z.literal(true).optional(),
	})
	.superRefine((account, ctx) => {
		if (
			account.pinned &&
			(account.credentialKind !== "subscription" || !account.directory)
		) {
			ctx.addIssue({ code: "custom", message: "Invalid pinned account" });
		}
	});

/** Malformed saved context must not silently become a default-account launch. */
export function parsePersistedSessionAccount(
	value: string | null,
): SessionAccount | undefined | null {
	if (value === null) return undefined;
	try {
		const parsed = persistedAccountSchema.safeParse(JSON.parse(value));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

/** Compare durable routing context independently of JSON order and display metadata. */
export function sameSessionAccountContext(
	left: SessionAccount | null | undefined,
	right: SessionAccount | null | undefined,
): boolean {
	if (!left || !right) return false;
	return (
		left.agent === right.agent &&
		left.credentialKind === right.credentialKind &&
		left.identity === right.identity &&
		left.selection === right.selection &&
		left.directory === right.directory &&
		(left.pinned === true) === (right.pinned === true) &&
		(left.conflict === true) === (right.conflict === true)
	);
}

async function hasApiMarker(
	agent: string,
	directory: string,
): Promise<boolean> {
	try {
		const file = await readProfileFile(join(directory, API_BILLING_MARKER), 64);
		return file?.content.trim() === agent;
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
		const state = await readProfileFile(file, 50 * 1024 * 1024);
		if (!state) return null;
		const data = JSON.parse(state.content);
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

	const profiles = await discoverSessionAccountProfiles(agent);
	const directory = await canonical(profile || profiles[0]?.directory || "");
	for (const candidate of profiles) {
		if ((await canonical(candidate.directory)) !== directory) continue;
		return readSessionAccount(agent, candidate);
	}
	return undefined;
}

interface SessionAccountProfile {
	directory: string;
	selection: string | null;
	credentialKind: "subscription" | "api_key";
}

async function discoverSessionAccountProfiles(
	agent: "claude" | "codex",
): Promise<SessionAccountProfile[]> {
	return agent === "claude"
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
}

async function readSessionAccount(
	agent: "claude" | "codex",
	candidate: SessionAccountProfile,
): Promise<SessionAccount | undefined> {
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
	return undefined;
}

/** Existing profiles only; this never reads keychain secrets or refreshes login. */
export async function discoverSessionAccounts(
	agent: "claude" | "codex",
): Promise<SessionAccount[]> {
	const profiles = await discoverSessionAccountProfiles(agent);
	const accounts = await Promise.all(
		profiles.map((profile) => readSessionAccount(agent, profile)),
	);
	return accounts.filter(
		(account): account is SessionAccount => account !== undefined,
	);
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
