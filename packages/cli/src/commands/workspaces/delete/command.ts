import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { TRPCClientError } from "@trpc/client";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Delete workspaces by ID on a host (default: this machine)",
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	options: {
		host: string().desc("Host the workspaces live on"),
		local: boolean().desc("Target this machine (the default)"),
	},
	run: async ({ ctx, args, options }) => {
		// Dedupe so a repeated ID can't be double-counted (the second attempt
		// would surface as a spurious not-found).
		const ids = [...new Set(args.ids as string[])];
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId =
			resolveHostFilter({
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			}) ?? getHostId();
		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const deleted: string[] = [];
		const notFound: string[] = [];
		const failed: { id: string; error: string }[] = [];
		const warnings: string[] = [];
		// Process every ID independently: a stale/not-found ID or a single
		// failed delete must not abort the rest of the batch (#5497).
		for (const id of ids) {
			try {
				const result = await target.client.workspace.delete.mutate({ id });
				deleted.push(id);
				for (const warning of result.warnings ?? []) {
					warnings.push(`${id}: ${warning}`);
				}
			} catch (error) {
				if (isTransportError(error)) {
					// The host never answered (connection refused, relay 503,
					// non-tRPC response) — every remaining ID would fail the
					// same way, so surface one connection error instead of
					// per-ID failures.
					const progress =
						deleted.length > 0
							? `\nDeleted before the failure: ${deleted.join(", ")}`
							: "";
					throw new CLIError(
						`Could not reach host ${target.hostId}: ${error.message}${progress}`,
						target.kind === "local" ? "Run: superset start" : undefined,
					);
				}
				if (isWorkspaceNotFoundError(error)) {
					// Delete is idempotent: an already-gone workspace is a
					// no-op, not a failure.
					notFound.push(id);
					continue;
				}
				failed.push({
					id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const lines: string[] = [];
		if (deleted.length > 0) {
			lines.push(
				deleted.length === 1
					? `Deleted workspace ${deleted[0]}`
					: `Deleted ${deleted.length} workspaces`,
			);
		}
		if (notFound.length > 0) {
			lines.push(
				`Not found (already deleted):\n${notFound.map((id) => `- ${id}`).join("\n")}`,
			);
		}
		if (failed.length > 0) {
			lines.push(
				`Failed to delete:\n${failed.map(({ id, error }) => `- ${id}: ${error}`).join("\n")}`,
			);
		}
		if (warnings.length > 0) {
			lines.push(
				`Warnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`,
			);
		}
		const message = lines.join("\n");

		// Exit non-zero only when a delete genuinely failed, while still
		// surfacing the full per-ID summary.
		if (failed.length > 0) {
			throw new CLIError(message);
		}

		return {
			data: { deleted, notFound, failed, warnings },
			message,
		};
	},
});

// A TRPCClientError without response `data` never got a tRPC reply — the
// failure is transport-level (host down, relay 503), not a per-ID verdict.
function isTransportError(error: unknown): error is Error {
	return error instanceof TRPCClientError && error.data == null;
}

// NOT_FOUND alone isn't proof the workspace is gone: tRPC also uses it for a
// missing procedure ('No procedure found on path "workspace.delete"' from a
// version-skewed host), which must stay a real failure. Require the
// workspace-not-found message the host/cloud routers actually emit.
function isWorkspaceNotFoundError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const trpcError = error as Error & {
		code?: string;
		data?: { code?: string };
	};
	return (
		(trpcError.data?.code ?? trpcError.code) === "NOT_FOUND" &&
		/workspace not found/i.test(trpcError.message)
	);
}
