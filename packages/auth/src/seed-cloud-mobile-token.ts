import fs from "node:fs/promises";
import { mintOneTimeToken, mintSessionForUser } from "./cloud-session";
import { auth } from "./server";

const ROOT_ENV_FILE = ".env";
const ENV_VAR = "EXPO_PUBLIC_DEV_ONE_TIME_TOKEN";

/**
 * Mints a real session for the cloud workspace's creator (mintSessionForUser)
 * and a one-time token redeemable for it (mintOneTimeToken), then writes the
 * token to the root .env.
 *
 * screens/(auth)/sign-in/components/DevSignInOptions calls
 * authClient.oneTimeToken.verify({ token }) with it on mount, so the mobile
 * app signs itself in as the real creator with nobody tapping anything — no
 * password, no SecureStore/Keychain internals touched directly.
 */
async function seedCloudMobileToken(): Promise<void> {
	if (process.env.IS_SANDBOX !== "1") {
		console.log(
			"seed-cloud-mobile-token: not a sandbox (IS_SANDBOX unset) — skipping",
		);
		return;
	}

	const creatorUserId = process.env.SUPERSET_SANDBOX_CREATOR_USER_ID;
	if (!creatorUserId) {
		console.log(
			"seed-cloud-mobile-token: no workspace creator (automation-created box?) — skipping",
		);
		return;
	}

	const existingEnv = await fs.readFile(ROOT_ENV_FILE, "utf8").catch(() => "");
	if (existingEnv.includes(`${ENV_VAR}=`)) {
		console.log(
			"seed-cloud-mobile-token: .env already has a dev sign-in token — skipping",
		);
		return;
	}

	const session = await mintSessionForUser(
		creatorUserId,
		process.env.SUPERSET_SANDBOX_ORGANIZATION_ID,
	);
	if (!session) {
		console.log(
			`seed-cloud-mobile-token: creator ${creatorUserId} has no row in this branch — skipping`,
		);
		return;
	}

	const token = await mintOneTimeToken(auth, session);

	await fs.appendFile(
		ROOT_ENV_FILE,
		`\n# Mobile dev sign-in (seed-cloud-mobile-token.ts)\n${ENV_VAR}='${token}'\n`,
	);

	console.log(
		`seed-cloud-mobile-token: one-time token minted for ${creatorUserId}`,
	);
}

seedCloudMobileToken()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("seed-cloud-mobile-token failed:", error);
		process.exit(1);
	});
