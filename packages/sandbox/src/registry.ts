/**
 * Logs Docker into Vercel Container Registry with a credential minted from
 * the sandbox project's token: the exchange `vercel vcr login` makes, minus
 * the CLI's need for a user account, so a push works from CI and a laptop
 * never holds a login that lapses.
 */
const REGISTRY = "vcr.vercel.com";
const KEYCHAIN_CONFLICT = /already exists in the keychain|errSecDuplicateItem/i;

/** Returns the repository prefix images push under, e.g. `vcr.vercel.com/<team>/<project>`. */
export async function loginToRegistry(): Promise<string> {
	const token = process.env.VERCEL_SANDBOX_TOKEN;
	const projectId = process.env.VERCEL_SANDBOX_PROJECT_ID;
	const teamId = process.env.VERCEL_SANDBOX_TEAM_ID;
	if (!token || !projectId || !teamId) {
		throw new Error(
			"VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_PROJECT_ID and VERCEL_SANDBOX_TEAM_ID are required to push",
		);
	}
	const response = await fetch(
		`https://api.vercel.com/v1/projects/${projectId}/token?teamId=${teamId}`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ source: "superset-sandbox-image" }),
		},
	);
	if (!response.ok) {
		throw new Error(`registry credential: Vercel answered ${response.status}`);
	}
	const { token: credential } = (await response.json()) as { token: string };
	const claims = JSON.parse(
		Buffer.from(credential.split(".")[1] ?? "", "base64url").toString("utf8"),
	) as { owner?: string; project?: string };
	if (!claims.owner || !claims.project) {
		throw new Error("registry credential names no team or project");
	}

	const login = () =>
		Bun.spawnSync(
			["docker", "login", REGISTRY, "--username", "oidc", "--password-stdin"],
			{ stdin: Buffer.from(credential), stdout: "ignore", stderr: "pipe" },
		);
	let result = login();
	if (
		result.exitCode !== 0 &&
		KEYCHAIN_CONFLICT.test(result.stderr.toString())
	) {
		Bun.spawnSync(["docker", "logout", REGISTRY], {
			stdout: "ignore",
			stderr: "ignore",
		});
		result = login();
	}
	if (result.exitCode !== 0) {
		throw new Error(
			`docker login ${REGISTRY} failed: ${result.stderr.toString().trim().split("\n").pop()}`,
		);
	}
	return `${REGISTRY}/${claims.owner}/${claims.project}`;
}
