import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	describeRegisterOutcome,
	loadLocalManifest,
	resolvePluginHost,
} from "../lib";

const GITHUB_SHORTHAND = /^[\w.-]+\/[\w.-]+$/;

export default command({
	description: "Install a plugin from a local directory or git URL",
	args: [
		positional("source")
			.required()
			.desc("Plugin directory, git URL, or owner/repo shorthand"),
	],
	options: {
		ref: string().desc("Git ref to install (branch, tag, or commit)"),
		host: string().desc("Target host machineId (default: this machine)"),
		local: boolean().desc("Target this machine (the default)"),
	},
	run: async ({ ctx, args, options }) => {
		const source = args.source as string;
		const target = await resolvePluginHost(ctx, {
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const isDirectory = existsSync(source) && statSync(source).isDirectory();
		if (isDirectory) {
			if (options.ref) {
				throw new CLIError("--ref only applies to git installs");
			}
			const absolute = path.resolve(source);
			const { manifest } = await loadLocalManifest(absolute);
			const contributes = manifest.contributes ?? {};
			const counts = [
				`commands=${contributes.commands?.length ?? 0}`,
				`sidebarTabs=${contributes.sidebarTabs?.length ?? 0}`,
				`panes=${contributes.panes?.length ?? 0}`,
				`themes=${contributes.themes?.length ?? 0}`,
				`events=${contributes.events?.length ?? 0}`,
			].join(" ");
			process.stderr.write(
				[
					`Installing ${manifest.id} (${manifest.name}) v${manifest.version}`,
					`  permissions: ${manifest.permissions?.length ? manifest.permissions.join(", ") : "none"}`,
					`  contributes: ${counts}`,
					"",
				].join("\n"),
			);
			const result = await target.client.plugins.install.mutate({
				type: "path",
				path: absolute,
			});
			return {
				data: result,
				message: describeRegisterOutcome("Installed", result),
			};
		}

		const url = GITHUB_SHORTHAND.test(source)
			? `https://github.com/${source}.git`
			: source;
		const result = await target.client.plugins.install.mutate({
			type: "git",
			url,
			ref: options.ref ?? undefined,
		});
		return {
			data: result,
			message: describeRegisterOutcome("Installed", result),
		};
	},
});
