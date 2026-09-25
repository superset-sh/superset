import { CLIError, positional, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { getApiUrl } from "../../../lib/config";
import {
	findInstalled,
	readInstalledPlugins,
	resolvePluginRef,
} from "../../../lib/plugins/host";
import {
	type AuthInputSpec,
	missingInputsError,
	parseInputs,
} from "../../../lib/plugins/inputs";

export default command({
	sandbox: false,
	description: "Connect an account to an installed plugin",
	args: [
		positional("plugin")
			.required()
			.desc("Plugin name, or name@marketplace to disambiguate"),
	],
	options: {
		marketplace: string().desc(
			"Which marketplace's install to connect, when several offer this name",
		),
		method: string()
			.enum("oauth2", "api_key")
			.desc("Which declared auth method to use, when a plugin offers several"),
		inputs: string().desc(
			'Credential inputs as JSON, or "-" to read them from stdin',
		),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["plugin", "status", "detail"],
			["PLUGIN", "STATUS", "DETAIL"],
			[18, 16, 60],
		),
	run: async ({ ctx, args, options }) => {
		const { name, marketplace } = resolvePluginRef(
			args.plugin as string,
			options.marketplace as string | undefined,
		);
		const installed = findInstalled(readInstalledPlugins(), name, marketplace);
		if (!installed) {
			throw new CLIError(
				marketplace
					? `"${name}" is not installed from "${marketplace}". Run: superset plugins install ${name} --marketplace ${marketplace}`
					: `"${name}" is not installed. Run: superset plugins install ${name}`,
			);
		}

		const catalog = await ctx.api.plugins.list.query();
		const slug =
			catalog.find(
				(entry) =>
					entry.name === name &&
					(!marketplace || entry.marketplace === marketplace),
			)?.connector ?? undefined;

		if (!slug) {
			return {
				data: [{ plugin: name, status: "not required", detail: "" }],
				message: `"${name}" needs no connection.`,
			};
		}

		const connector = await ctx.api.connectors.get.query({ slug });
		const methods = connector.methods;

		const requested = options.method as string | undefined;
		const auth = requested
			? methods.find((entry) => entry.type === requested)
			: methods.length === 1
				? methods[0]
				: undefined;

		if (methods.length > 1 && !auth) {
			throw new CLIError(
				[
					`"${name}" offers more than one way to connect. Ask the user which they prefer, then run:`,
					"",
					...methods.map(
						(entry) =>
							`  superset plugins connect ${name} --method ${entry.type}${entry.label ? `   (${entry.label})` : ""}`,
					),
				].join("\n"),
			);
		}

		if (!auth) {
			throw new CLIError(`"${slug}" has no ${requested ?? "default"} method.`);
		}

		const declared = (auth.inputs ?? []) as AuthInputSpec[];
		const provided = await parseInputs(options.inputs as string | undefined);

		if (auth.type === "api_key") {
			const missing = declared.filter(
				(input) => input.required !== false && !provided[input.name],
			);
			if (missing.length) throw missingInputsError(name, missing, declared);

			const organization = await ctx.api.user.myOrganization.query();
			if (!organization) {
				throw new CLIError(
					"You need to be part of an organization to connect accounts.",
				);
			}

			const created = await ctx.api.connectors.connectApiKey.mutate({
				organizationId: organization.id,
				slug,
				inputs: provided,
			});
			return {
				data: [
					{ plugin: name, status: "connected", detail: created.connectionId },
				],
				message: `Connected ${slug} for ${name}.`,
			};
		}

		const secrets = declared.filter((input) => input.secret);
		if (secrets.length) {
			throw new CLIError(
				`"${name}" declares ${secrets
					.map((input) => `"${input.name}"`)
					.join(
						", ",
					)} as secret on its oauth2 method. A browser authorization URL cannot carry a secret; report this to the plugin's author.`,
			);
		}

		const missing = declared.filter(
			(input) => input.required && !provided[input.name],
		);
		if (missing.length) throw missingInputsError(name, missing, declared);

		const params = new URLSearchParams({
			...Object.fromEntries(
				declared
					.filter((input) => !input.secret && input.name in provided)
					.map((input) => [input.name, provided[input.name] as string]),
			),
			method: auth.type,
		});
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization) {
			throw new CLIError(
				"You need to be part of an organization to connect accounts.",
			);
		}
		params.set("organizationId", organization.id);
		const url = `${getApiUrl()}/api/connectors/${slug}/connect?${params}`;

		return {
			data: [{ plugin: name, status: "authorize", detail: url }],
			message: [
				`Open this URL to authorize ${name}:`,
				`  ${url}`,
				"",
				`Then confirm with: superset plugins list`,
			].join("\n"),
		};
	},
});
