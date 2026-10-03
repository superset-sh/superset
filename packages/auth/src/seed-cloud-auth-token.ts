import fs from "node:fs/promises";
import path from "node:path";
import { encrypt } from "@superset/shared/auth-token-crypto";
import { mintSessionForUser } from "./cloud-session";

const TOKEN_FILE_NAME = "auth-token.enc";
const SENSITIVE_FILE_MODE = 0o600;
const HOME_DIR_MODE = 0o700;

/**
 * Mints a real session for the cloud workspace's creator and seeds it into
 * superset-dev-data/, the same way a sign-in through the desktop app would —
 * so the dev build of the desktop app comes up already signed in as the
 * person who made the workspace, instead of the shared `admin@local.test`
 * dev account. Only possible because a workspace's Neon branch is a
 * copy-on-write branch of production: the creator's real `users` row is
 * already there.
 *
 * The encryption key is derived from this machine's own id
 * (packages/shared/src/host-info.ts), so this must run on the sandbox itself,
 * never on a workstation producing a file to copy elsewhere.
 */
async function seedCloudAuthToken(): Promise<void> {
	if (process.env.IS_SANDBOX !== "1") {
		console.log(
			"seed-cloud-auth-token: not a sandbox (IS_SANDBOX unset) — skipping",
		);
		return;
	}

	const creatorUserId = process.env.SUPERSET_SANDBOX_CREATOR_USER_ID;
	if (!creatorUserId) {
		console.log(
			"seed-cloud-auth-token: no workspace creator (automation-created box?) — skipping",
		);
		return;
	}

	const homeDir = process.env.SUPERSET_HOME_DIR;
	if (!homeDir) {
		throw new Error("SUPERSET_HOME_DIR is not set");
	}

	const destToken = path.join(homeDir, TOKEN_FILE_NAME);
	if (
		await fs
			.access(destToken)
			.then(() => true)
			.catch(() => false)
	) {
		console.log(
			`seed-cloud-auth-token: ${destToken} already exists — skipping`,
		);
		return;
	}

	const session = await mintSessionForUser(
		creatorUserId,
		process.env.SUPERSET_SANDBOX_ORGANIZATION_ID,
	);
	if (!session) {
		console.log(
			`seed-cloud-auth-token: creator ${creatorUserId} has no row in this branch — skipping`,
		);
		return;
	}

	const storedAuth = JSON.stringify({
		token: session.token,
		expiresAt: session.expiresAt.toISOString(),
	});

	// mkdir's mode is masked by umask, same as open() elsewhere in this codebase's
	// auth storage (auth-functions.ts's atomicWriteToken) — chmod explicitly.
	await fs.mkdir(homeDir, { recursive: true });
	await fs.chmod(homeDir, HOME_DIR_MODE);
	await fs.writeFile(destToken, encrypt(storedAuth), {
		mode: SENSITIVE_FILE_MODE,
	});
	await fs.chmod(destToken, SENSITIVE_FILE_MODE);

	console.log(`seed-cloud-auth-token: signed in as ${creatorUserId}`);
}

seedCloudAuthToken()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("seed-cloud-auth-token failed:", error);
		process.exit(1);
	});
