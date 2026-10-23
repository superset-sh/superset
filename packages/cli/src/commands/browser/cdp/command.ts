import { CLIError, string } from "@superset/cli-framework";
import { ensureCdpProxy } from "../../../lib/cdp-proxy/client";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description:
		"Print a raw CDP WebSocket endpoint for a pane (for browser-use / Playwright-class tools)",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		pane: string().required().desc("Pane ID (from `superset browser list`)"),
	},
	run: async ({ ctx, options }) => {
		const { client, ws, kind, hostId } = await resolveBrowserTarget(
			ctx,
			options,
		);
		// Verify the pane exists in this workspace before handing out a URL — a
		// dead/foreign pane id would otherwise fail only once the tool dials in.
		const { panes } = await client.browser.list.query({
			workspaceId: options.workspace,
		});
		if (!panes.some((p) => p.paneId === options.pane)) {
			throw new CLIError(
				`No browser pane ${options.pane} in workspace ${options.workspace}`,
				"Run: superset browser list --workspace <id>",
			);
		}
		const endpoint = `${ws.baseWsUrl}/browser/${encodeURIComponent(
			options.pane,
		)}/cdp?workspaceId=${encodeURIComponent(options.workspace)}`;
		if (
			kind === "remote" &&
			(ctx.bearer.startsWith("sk_live_") || ctx.bearer.startsWith("sk_test_"))
		) {
			const proxy = await ensureCdpProxy({
				apiKey: ctx.bearer,
				organizationId: ctx.config.organizationId!,
				hostId,
				workspaceId: options.workspace,
				paneId: options.pane,
				upstreamUrl: endpoint,
			});
			process.stderr.write(
				`This local URL grants CDP control of the pane. Treat it as a secret.\nStop the proxy with: superset browser cdp-stop --id ${proxy.proxyId}\n`,
			);
			return {
				data: proxy,
				message: proxy.url,
			};
		}
		const token = ws.getToken ? await ws.getToken() : ws.token;
		const url = `${endpoint}&token=${encodeURIComponent(token)}`;
		return {
			data: { url },
			// The URL embeds a bearer token — treat it as a credential (keep it out
			// of shared logs / screenshots).
			message: `${url}\n\nNote: this URL contains an auth token — treat it as a secret.`,
		};
	},
});
