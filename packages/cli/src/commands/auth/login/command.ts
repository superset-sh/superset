import * as p from "@clack/prompts";
import { CLIError, string } from "@superset/cli-framework";
import { render } from "ink";
import { createElement } from "react";
import { type ApiClient, createApiClient } from "../../../lib/api-client";
import { login } from "../../../lib/auth";
import { command } from "../../../lib/command";
import {
	readConfig,
	type SupersetConfig,
	writeConfig,
} from "../../../lib/config";
import { copyToClipboard } from "./copyToClipboard";
import { LoginUI, type LoginUIProps } from "./LoginUI";

type LoginOutput =
	| { loggedIn: false }
	| { loggedIn: true }
	| {
			userId: string;
			organizationId: string;
			organizationName: string;
	  };

function apiKeyFlagInArgv(): boolean {
	return process.argv.some(
		(arg) => arg === "--api-key" || arg.startsWith("--api-key="),
	);
}

async function selectOrganization({
	api,
	config,
	requested,
}: {
	api: ApiClient;
	config: SupersetConfig;
	requested: string | undefined;
}): Promise<{
	output: LoginOutput;
	cancelled: boolean;
}> {
	const organizations = await api.user.myOrganizations.query();
	const sessionActive = await api.user.myOrganization.query();

	const explicitChoice = requested
		? organizations.find(
				(org) => org.id === requested || org.slug === requested,
			)
		: undefined;

	if (requested && !explicitChoice) {
		throw new CLIError(
			`Organization not found: ${requested}`,
			`Available: ${organizations.map((o) => o.slug).join(", ")}`,
		);
	}

	let chosen = explicitChoice ?? sessionActive ?? null;

	if (!chosen) {
		if (organizations.length === 1) {
			chosen = organizations[0] ?? null;
		} else if (organizations.length > 1) {
			if (!process.stdout.isTTY) {
				throw new CLIError(
					"Multiple organizations available; pass --organization <slug>",
					`Available: ${organizations.map((o) => o.slug).join(", ")}`,
				);
			}
			const selection = await p.select({
				message: "Select organization for this CLI",
				initialValue: organizations[0]?.id,
				options: organizations.map((organization) => ({
					value: organization.id,
					label: `${organization.name} (${organization.slug})`,
				})),
			});
			if (p.isCancel(selection)) {
				p.cancel("Login cancelled");
				return { output: { loggedIn: true }, cancelled: true };
			}
			chosen = organizations.find((o) => o.id === selection) ?? null;
		}
	}

	if (chosen) {
		config.organizationId = chosen.id;
		writeConfig(config);
		p.log.info(`Organization: ${chosen.name}`);
		const me = await api.user.me.query();
		return {
			output: {
				userId: me.id,
				organizationId: chosen.id,
				organizationName: chosen.name,
			},
			cancelled: false,
		};
	}

	return { output: { loggedIn: true }, cancelled: false };
}

async function runApiKeyLogin({
	apiKey,
	requestedOrganization,
}: {
	apiKey: string;
	requestedOrganization: string | undefined;
}): Promise<LoginOutput> {
	p.intro("superset auth login");

	const api = createApiClient({ bearer: apiKey });

	let user: Awaited<ReturnType<typeof api.user.me.query>>;
	try {
		user = await api.user.me.query();
	} catch (error) {
		throw new CLIError(
			"API key rejected",
			error instanceof Error ? error.message : String(error),
		);
	}

	const config = readConfig();
	config.apiKey = apiKey;
	delete config.auth;
	writeConfig(config);

	p.log.success("API key stored.");
	p.log.info(`${user.name} (${user.email})`);

	const { output, cancelled } = await selectOrganization({
		api,
		config,
		requested: requestedOrganization,
	});

	if (cancelled) {
		return output;
	}
	p.outro("Logged in successfully.");
	return output;
}

export default command({
	description: "Authenticate with Superset. Re-run to switch organizations.",
	skipMiddleware: true,
	options: {
		organization: string().desc(
			"Organization id or slug — required for non-TTY logins when you belong to multiple orgs",
		),
		apiKey: string().desc(
			"Store a Superset API key (sk_live_…) at ~/.superset/config.json instead of running the OAuth flow",
		),
	},
	run: async (opts) => {
		const requestedOrganization = opts.options.organization;
		const apiKeyFromCli = apiKeyFlagInArgv()
			? opts.options.apiKey?.trim()
			: undefined;

		if (apiKeyFromCli) {
			const data = await runApiKeyLogin({
				apiKey: apiKeyFromCli,
				requestedOrganization,
			});
			return { data };
		}

		const config = readConfig();
		const useInk =
			process.stdout.isTTY && process.stdin.isTTY && !process.env.CI;

		let pasteResolve: ((code: string) => void) | null = null;
		let pasteReject: ((err: Error) => void) | null = null;
		const pastePromise = new Promise<string>((resolve, reject) => {
			pasteResolve = resolve;
			pasteReject = reject;
		});

		let currentProps: LoginUIProps = {
			url: null,
			status: "starting",
			onSubmit: (code) => pasteResolve?.(code),
			onCancel: () => pasteReject?.(new CLIError("Login cancelled")),
			onCopy: async () => false,
		};

		const inkInstance = useInk
			? render(createElement(LoginUI, currentProps), { exitOnCtrlC: false })
			: null;

		const update = (patch: Partial<LoginUIProps>) => {
			currentProps = { ...currentProps, ...patch };
			inkInstance?.rerender(createElement(LoginUI, currentProps));
		};

		if (!inkInstance) {
			p.intro("superset auth login");
		}

		let result: Awaited<ReturnType<typeof login>> | null = null;
		let cancelled = false;
		try {
			result = await login(opts.signal, {
				onAuthorizationUrl: (url) => {
					if (inkInstance) {
						update({
							url,
							status: "waiting",
							onCopy: () => copyToClipboard(url),
						});
					} else {
						p.log.message("Browser didn't open? Use the url below to sign in");
						p.log.message(url);
					}
				},
				promptForPastedCode: async (signal) => {
					if (!inkInstance) {
						const pasted = await p.text({
							message: "Paste code here if prompted",
							validate: (value) =>
								value.includes("#") ? undefined : "Paste the entire value",
						});
						if (signal.aborted) return "";
						if (p.isCancel(pasted)) {
							throw new CLIError("Login cancelled");
						}
						return pasted;
					}
					const onAbort = () => pasteResolve?.("");
					signal.addEventListener("abort", onAbort);
					try {
						const code = await pastePromise;
						if (signal.aborted) return "";
						update({ status: "exchanging" });
						return code;
					} finally {
						signal.removeEventListener("abort", onAbort);
					}
				},
			});
			if (inkInstance) update({ status: "done" });
		} catch (err) {
			if (err instanceof CLIError && err.message === "Login cancelled") {
				cancelled = true;
			} else {
				throw err;
			}
		} finally {
			if (inkInstance) {
				inkInstance.unmount();
				await inkInstance.waitUntilExit().catch(() => {});
			}
		}

		if (cancelled || !result) {
			p.cancel("Login interrupted");
			return { data: { loggedIn: false } };
		}

		config.auth = {
			accessToken: result.accessToken,
			refreshToken: result.refreshToken,
			expiresAt: result.expiresAt,
		};
		delete config.apiKey;
		writeConfig(config);

		p.log.success("Authorized!");

		const api = createApiClient({ bearer: result.accessToken });

		try {
			const user = await api.user.me.query();
			p.log.info(`${user.name} (${user.email})`);
		} catch (error) {
			p.log.warn(
				`Could not fetch user profile: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		const { output, cancelled: orgCancelled } = await selectOrganization({
			api,
			config,
			requested: requestedOrganization,
		});

		if (orgCancelled) {
			return { data: output };
		}
		p.outro("Logged in successfully.");
		return { data: output };
	},
});
