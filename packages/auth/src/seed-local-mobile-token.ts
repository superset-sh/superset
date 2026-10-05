import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decrypt } from "@superset/shared/auth-token-crypto";
import { mintOneTimeToken, mintSessionForUser } from "./cloud-session";
import { auth } from "./server";

const ROOT_ENV_FILE = ".env";
const ENV_VAR = "EXPO_PUBLIC_DEV_ONE_TIME_TOKEN";
const GLOBAL_TOKEN_FILE = path.join(
	os.homedir(),
	".superset",
	"auth-token.enc",
);
// apps/desktop/src/renderer/env.renderer.ts's own default for
// NEXT_PUBLIC_API_URL — the one place the production API's domain is
// otherwise only ever supplied by Vercel, never literally written down.
const PRODUCTION_API_URL = "https://api.superset.sh";

/**
 * The local counterpart of seed-cloud-mobile-token.ts, run by
 * .superset/setup.sh (lib/setup/main.sh) right after step_seed_auth_token —
 * fully automated, so unlike that script it can't ask who you are. Instead
 * it reuses the same signal step_seed_auth_token already trusts: whatever
 * desktop sign-in already exists on this machine
 * ($HOME/.superset/auth-token.enc, machine-key encrypted). That token was
 * minted against production, not this worktree's fresh Neon branch, so the
 * only way to learn who it belongs to is to ask production — the same
 * /api/auth/get-session call the real desktop app makes to validate its own
 * stored token on boot.
 *
 * Silently does nothing (mobile falls back to the manual dev sign-in button)
 * when there's no local desktop sign-in yet, it's expired, or production is
 * unreachable — this is a convenience, never a setup blocker.
 */
async function seedLocalMobileToken(): Promise<void> {
	if (process.env.IS_SANDBOX === "1") {
		console.log(
			"seed-local-mobile-token: a cloud sandbox — seed-cloud-mobile-token.ts owns this, skipping",
		);
		return;
	}

	const existingEnv = await fs.readFile(ROOT_ENV_FILE, "utf8").catch(() => "");
	if (existingEnv.includes(`${ENV_VAR}=`)) {
		console.log(
			"seed-local-mobile-token: .env already has a dev sign-in token — skipping",
		);
		return;
	}

	const raw = await fs.readFile(GLOBAL_TOKEN_FILE).catch(() => null);
	if (!raw) {
		console.log(
			`seed-local-mobile-token: no desktop sign-in found at ${GLOBAL_TOKEN_FILE} — skipping (mobile will fall back to its manual dev sign-in)`,
		);
		return;
	}

	let storedToken: string;
	let storedExpiresAt: string;
	try {
		const parsed = JSON.parse(decrypt(raw)) as {
			token?: string;
			expiresAt?: string;
		};
		if (!parsed.token || !parsed.expiresAt) throw new Error("missing fields");
		storedToken = parsed.token;
		storedExpiresAt = parsed.expiresAt;
	} catch {
		console.log(
			"seed-local-mobile-token: stored auth token is unreadable on this machine — skipping",
		);
		return;
	}
	if (new Date(storedExpiresAt) < new Date()) {
		console.log(
			"seed-local-mobile-token: stored auth token is expired — skipping",
		);
		return;
	}

	const response = await fetch(`${PRODUCTION_API_URL}/api/auth/get-session`, {
		headers: { authorization: `Bearer ${storedToken}` },
	}).catch(() => null);
	if (!response?.ok) {
		console.log(
			"seed-local-mobile-token: could not validate the stored token against production — skipping",
		);
		return;
	}
	const resolved = (await response.json().catch(() => null)) as {
		user?: { id?: string };
		session?: { activeOrganizationId?: string };
	} | null;
	const userId = resolved?.user?.id;
	if (!userId) {
		console.log(
			"seed-local-mobile-token: production did not recognize the stored token — skipping",
		);
		return;
	}

	const session = await mintSessionForUser(
		userId,
		resolved?.session?.activeOrganizationId,
	);
	if (!session) {
		console.log(
			`seed-local-mobile-token: ${userId} has no row in this branch — skipping`,
		);
		return;
	}

	const token = await mintOneTimeToken(auth, session);

	await fs.appendFile(
		ROOT_ENV_FILE,
		`\n# Mobile dev sign-in (seed-local-mobile-token.ts)\n${ENV_VAR}='${token}'\n`,
	);

	console.log(`seed-local-mobile-token: one-time token minted for ${userId}`);
}

seedLocalMobileToken()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("seed-local-mobile-token failed:", error);
		process.exit(1);
	});
