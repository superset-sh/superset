import {
	boolean,
	CLIError,
	positional,
	string,
	table,
} from "@superset/cli-framework";
import { isOrganizationMarketplace } from "@superset/shared/plugins";
import type { ApiClient } from "../../../lib/api-client";
import { command } from "../../../lib/command";
import { canReachDesktop, openUrl } from "../../../lib/open-url";
import { authorizeUrl, chooseAuthMethod } from "../../../lib/plugins/connect";
import { resolvePluginRef } from "../../../lib/plugins/host";
import {
	type AuthInputSpec,
	missingInputsError,
	parseInputs,
} from "../../../lib/plugins/inputs";
import {
	ensureDefaultMarketplace,
	installPlugin,
	listAvailable,
} from "../../../lib/plugins/install";
import { syncPluginMcpServers } from "../../../lib/plugins/mcp-servers";
import { installOrganizationPlugin } from "../../../lib/plugins/organization";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

type ConnectFirst =
	| { status: "ready"; connection: string }
	| { status: "authorize"; url: string };

const ORGANIZATION = "organization";

async function organizationPlugin(
	api: ApiClient,
	name: string,
	marketplace: string | undefined,
) {
	const named =
		marketplace === ORGANIZATION ||
		(marketplace !== undefined && isOrganizationMarketplace(marketplace));
	if (marketplace && !named) return null;
	if (!named && listAvailable().some((a) => a.entry.name === name)) return null;

	const plugins = await api.plugins.organization.list.query().catch((error) => {
		if (named) throw error;
		return [];
	});
	const plugin = plugins.find(
		(p) =>
			p.name === name &&
			(!marketplace ||
				marketplace === ORGANIZATION ||
				p.marketplace === marketplace),
	);
	if (!plugin && named) {
		throw new CLIError(
			`Your organization has no plugin "${name}".`,
			"See what it has: superset plugins organization list",
		);
	}
	return plugin ?? null;
}

export default command({
	sandbox: false,
	description:
		"Install a plugin: connect its account first if it needs one, then materialize its skills locally and record it on your account",
	args: [
		positional("plugin")
			.required()
			.desc(
				"Plugin name, or name@marketplace to disambiguate (name@organization for one your organization published)",
			),
	],
	options: {
		marketplace: string().desc(
			"Which marketplace to install from, when several offer this name",
		),
		method: string()
			.enum("oauth2", "api_key")
			.desc("Which declared auth method to use, when a plugin offers several"),
		inputs: string().desc(
			'Credential inputs as JSON, or "-" to read them from stdin',
		),
		update: boolean().desc(
			"Replace an existing install with the marketplace's current version, and re-sync its skills",
		),
		noWait: boolean().desc(
			"Print the authorize URL and exit without waiting; run install again once it is authorized",
		),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "version", "skills", "connection"],
			["PLUGIN", "VERSION", "SKILLS", "CONNECTION"],
			[20, 10, 8, 40],
		),
	run: async ({ ctx, args, options }) => {
		await ensureDefaultMarketplace();
		const { name, marketplace } = resolvePluginRef(
			args.plugin as string,
			options.marketplace as string | undefined,
		);

		const organization = await organizationPlugin(ctx.api, name, marketplace);

		const connected = options.update
			? ({ status: "ready", connection: "unchanged" } as const)
			: await connectFirst({
					api: ctx.api,
					name,
					marketplace: organization?.marketplace ?? marketplace,
					method: options.method as string | undefined,
					inputs: options.inputs as string | undefined,
					noWait: Boolean(options.noWait),
				});

		if (connected.status === "authorize") {
			return {
				data: [{ name, connection: "authorize", url: connected.url }],
				message: `Open this URL to connect ${name}:\n  ${connected.url}\nThen run superset plugins install ${name} again to install it.`,
			};
		}

		let local: Awaited<ReturnType<typeof installPlugin>>;
		let accountError: string | null = null;

		if (organization) {
			await ctx.api.plugins.install.mutate({
				name,
				marketplace: organization.marketplace,
			});
			local = await installOrganizationPlugin(ctx.api, name);
		} else {
			local = await installPlugin(name, marketplace, {
				update: Boolean(options.update),
			});
			try {
				await ctx.api.plugins.install.mutate({
					name,
					marketplace: local.marketplace,
				});
			} catch (error) {
				accountError = error instanceof Error ? error.message : String(error);
			}
		}

		const mcp = syncPluginMcpServers();

		const next = accountError
			? ` Its skills work, but tools will not until the account install succeeds: ${accountError}`
			: mcp.error
				? ` Its skills work, but no agent can reach its tools until the MCP config is writable: ${mcp.error}`
				: "";

		return {
			data: [
				{
					name: local.name,
					version: local.version,
					marketplace: local.marketplace,
					skills: local.skills,
					connection: accountError
						? "account sync failed"
						: connected.connection,
				},
			],
			message: `Installed ${local.name}@${local.version}. ${local.skills} skill${local.skills === 1 ? "" : "s"} synced.${next}`,
		};
	},
});

async function connectFirst({
	api,
	name,
	marketplace,
	method,
	inputs,
	noWait,
}: {
	api: ApiClient;
	name: string;
	marketplace: string | undefined;
	method: string | undefined;
	inputs: string | undefined;
	noWait: boolean;
}): Promise<ConnectFirst> {
	const catalog = await api.plugins.list.query();
	const slug = catalog.find(
		(entry) =>
			entry.name === name &&
			(!marketplace || entry.marketplace === marketplace),
	)?.connector;
	if (!slug) return { status: "ready", connection: "not required" };

	const organization = await api.user.myOrganization.query();
	if (!organization) {
		throw new CLIError(
			"You need to be part of an organization to connect accounts.",
		);
	}
	const organizationId = organization.id;

	const accountLabel = async () => {
		const accounts = (
			await api.connectors.status.query({ organizationId })
		).filter((row) => row.connector === slug);
		const first = accounts[0];
		if (!first) return null;
		return `connected as ${first.externalUserLabel ?? first.externalAccountLabel ?? slug}`;
	};

	const existing = await accountLabel();
	if (existing) return { status: "ready", connection: existing };

	const connector = await api.connectors.get.query({ slug });
	const auth = chooseAuthMethod({
		command: "install",
		pluginName: name,
		slug,
		methods: connector.methods,
		requested: method,
	});
	const provided = await parseInputs(inputs);

	if (auth.type === "api_key") {
		const declared = (auth.inputs ?? []) as AuthInputSpec[];
		const missing = declared.filter(
			(input) => input.required !== false && !provided[input.name],
		);
		if (missing.length) {
			throw missingInputsError(name, missing, declared, "install");
		}
		await api.connectors.connectApiKey.mutate({
			organizationId,
			slug,
			inputs: provided,
		});
		return { status: "ready", connection: `connected ${slug}` };
	}

	const url = authorizeUrl({
		command: "install",
		pluginName: name,
		slug,
		auth,
		provided,
		organizationId,
	});
	const opened =
		canReachDesktop() &&
		(await openUrl(url).then(
			() => true,
			() => false,
		));
	if (noWait) return { status: "authorize", url };

	process.stderr.write(
		`${opened ? "If your browser did not open, open" : "Open"} this URL to connect ${name}:\n  ${url}\nWaiting for you to authorize…\n`,
	);
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		const connection = await accountLabel();
		if (connection) return { status: "ready", connection };
	}
	throw new CLIError(
		`${name} was not connected in 5 minutes, so it was not installed`,
		`Run: superset plugins install ${name}`,
	);
}
