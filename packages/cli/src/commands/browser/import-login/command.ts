import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description:
		"Import logins (cookies) from a system browser into a browser pane's session",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		pane: string().required().desc("Pane ID (from `superset browser list`)"),
		from: string().desc(
			"Source browser to import from, e.g. 'Comet', 'Chrome' (matches the browser name)",
		),
		profile: string().desc(
			"Profile name to disambiguate when the browser has several",
		),
	},
	run: async ({ ctx, options }) => {
		const { client } = await resolveBrowserTarget(ctx, options);
		const { sources } = await client.browser.importSources.query();

		const describe = (s: (typeof sources)[number]) =>
			`${s.browserName} — ${s.profileName}`;

		if (sources.length === 0) {
			throw new CLIError(
				"No Chromium browsers found to import from",
				"Superset can import from Chrome, Edge, Brave, Arc, Dia, or Comet.",
			);
		}

		if (!options.from) {
			return {
				data: sources,
				message: [
					"Available browsers to import from (pass one with --from):",
					...sources.map((s) => `  ${describe(s)}`),
				].join("\n"),
			};
		}

		const from = options.from.toLowerCase();
		const profile = options.profile?.toLowerCase();
		const matches = sources.filter(
			(s) =>
				s.browserName.toLowerCase().includes(from) &&
				(!profile || s.profileName.toLowerCase().includes(profile)),
		);

		if (matches.length === 0) {
			throw new CLIError(
				`No browser matching "${options.from}"`,
				`Available: ${sources.map(describe).join(", ")}`,
			);
		}
		if (matches.length > 1) {
			throw new CLIError(
				`"${options.from}" matches several profiles`,
				`Narrow it with --profile. Matches: ${matches.map(describe).join(", ")}`,
			);
		}

		const source = matches[0];
		if (!source) {
			throw new CLIError(`No browser matching "${options.from}"`);
		}
		const result = await client.browser.importCookies.mutate({
			workspaceId: options.workspace,
			paneId: options.pane,
			sourceId: source.id,
		});

		if (result.keyUnavailable) {
			return {
				data: result,
				message: `Could not read logins from ${describe(source)} — the Keychain key was unavailable. Quit that browser and grant Keychain access, then retry.`,
			};
		}

		return {
			data: result,
			message: `Imported ${result.imported} login${
				result.imported === 1 ? "" : "s"
			} from ${describe(source)} into ${options.pane} (${result.skipped} skipped). Reload the pane to use them.`,
		};
	},
});
