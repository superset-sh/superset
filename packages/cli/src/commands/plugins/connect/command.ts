import fs from "node:fs";
import path from "node:path";
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
import { supersetExtension } from "../../../lib/plugins/marketplace";

export default command({
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

		const methods =
			supersetExtension(
				JSON.parse(
					fs.readFileSync(
						path.join(installed.installPath, "plugin.json"),
						"utf8",
					),
				),
			)?.auth ?? [];

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
			return {
				data: [{ plugin: name, status: "not required", detail: "" }],
				message: `"${name}" needs no connection.`,
			};
		}

		const declared = (auth.inputs ?? []) as AuthInputSpec[];
		const provided = await parseInputs(options.inputs as string | undefined);

		if (auth.type === "api_key") {
			const missing = declared.filter(
				(input) => input.required !== false && !provided[input.name],
			);
			if (missing.length) throw missingInputsError(name, missing, declared);

			const created = await ctx.api.plugins.connectApiKey.mutate({
				name,
				inputs: provided,
			});
			return {
				data: [
					{
						plugin: name,
						status: "connected",
						detail: created.account ?? created.connectionId,
					},
				],
				message: `Connected ${name}${created.account ? ` as ${created.account}` : ""}.`,
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
		const url = `${getApiUrl()}/api/plugins/${name}/connect?${params}`;

		return {
			data: [{ plugin: name, status: "authorize", detail: url }],
			message: [
				`Open this URL to authorize ${name}:`,
				`  ${url}`,
				"",
				`Then confirm with: superset plugins connections --plugin ${name}`,
			].join("\n"),
		};
	},
});
