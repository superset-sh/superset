import type { Hono } from "hono";

/**
 * The in-sandbox half of the git credential broker.
 *
 * `git-askpass.sh` calls this when git needs a username or password. This
 * route asks the API for one — proving which sandbox it is with the secret it
 * was handed at provision — and answers in git's credential format so the
 * helper can pass it straight through. Nothing is stored anywhere: no cache
 * helper is registered, so every git operation asks again and the credential
 * lives exactly as long as the git process that requested it.
 *
 * Loopback only, and only in sandbox mode. There is no auth on this route
 * because the trust boundary is the network namespace: only a process inside
 * the sandbox can reach 127.0.0.1, and that is exactly the set of processes
 * git runs as. Binding it anywhere else would hand a credential mint to the
 * internet.
 */
export function registerGitCredentialRoute(args: {
	app: Hono;
	apiUrl: string;
	workspaceId: string;
	sandboxSecret: string;
}): void {
	const { app, apiUrl, workspaceId, sandboxSecret } = args;

	app.post("/git-credential", async (c) => {
		const remote = c.req.header("x-forwarded-for") ?? "";
		const host = c.req.header("host") ?? "";
		// The preview URL reaches this same Hono app from the edge, so a path
		// alone is not enough — refuse anything that did not arrive on loopback.
		if (remote || !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) {
			console.warn(
				`[git-credential] refused non-loopback caller host=${JSON.stringify(host)} xff=${JSON.stringify(remote)}`,
			);
			return c.text("forbidden", 403);
		}

		const body = await c.req.text();
		const fields = new Map<string, string>();
		for (const line of body.split("\n")) {
			const eq = line.indexOf("=");
			if (eq > 0) fields.set(line.slice(0, eq), line.slice(eq + 1));
		}
		const requestedHost = fields.get("host") ?? "";
		const branch = fields.get("branch") || undefined;

		try {
			// Called directly rather than through host-service's api client: that
			// client mints a user JWT for every request, and a sandbox has no user
			// to mint for (its AUTH_TOKEN is a placeholder). This call carries its
			// own credential — the sandbox secret — the way an agent authenticates
			// to its control plane, independent of anyone's session.
			const cred = await mintViaApi(apiUrl, {
				workspaceId,
				sandboxSecret,
				host: requestedHost,
				branch,
			});
			// git credential protocol: key=value lines, blank-line terminated.
			// password_expiry_utc is advisory — it only bounds a caching helper,
			// and none is registered — but a git that understands it (≥ 2.40)
			// will at least refuse to hand back a stale one.
			return c.text(
				[
					`username=${cred.username}`,
					`password=${cred.password}`,
					`password_expiry_utc=${cred.expiresAt}`,
					"",
				].join("\n"),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[git-credential] refused for ${requestedHost}: ${message}`);
			// An empty body makes git fall through to "no credential" and fail
			// the operation loudly rather than hanging on a prompt; the reason
			// rides in a header so a human debugging inside the sandbox can see
			// it without it landing in git's credential stream.
			c.header("x-git-credential-error", message.slice(0, 200));
			return c.text("", 403);
		}
	});
}

interface MintedCredential {
	username: string;
	password: string;
	expiresAt: number;
}

async function mintViaApi(
	apiUrl: string,
	input: {
		workspaceId: string;
		sandboxSecret: string;
		host: string;
		branch?: string;
	},
): Promise<MintedCredential> {
	const res = await fetch(
		`${apiUrl.replace(/\/$/, "")}/api/trpc/cloudWorkspace.gitCredential?batch=1`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ 0: { json: input } }),
			signal: AbortSignal.timeout(20_000),
		},
	);
	const body = (await res.json()) as Array<{
		result?: { data?: { json?: MintedCredential } };
		error?: { json?: { message?: string } };
	}>;
	const first = body[0];
	if (!res.ok || !first?.result?.data?.json) {
		throw new Error(
			first?.error?.json?.message ?? `API answered ${res.status}`,
		);
	}
	return first.result.data.json;
}
