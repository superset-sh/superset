import nodePath from "node:path";
import { EXTERNAL_APPS } from "@superset/local-db/schema/zod";
import { getHostId } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { getAppCommand, spawnAsync } from "./helpers";

/**
 * Mitigation for #5850 / #5893: in shipped builds `external.openInApp` (an
 * Electron-IPC call typed to the desktop `AppRouter`) can be serviced by the
 * host service instead of the desktop main process. The host service's router
 * has no `external` key, so the call fails with
 * `No procedure found on path "external.openInApp"` and the "Open in app"
 * button / ⌘O silently break.
 *
 * The correct fix is on the desktop transport (external.* must reach the
 * main-process router). Until that lands, we accept the misroute *only when the
 * host is the caller's own machine* — the same locality check the desktop uses
 * for `isLocalWorkspace` (`workspace.hostId === machineId`). For a remote host
 * these actions are meaningless (they'd open an editor on the server), so we
 * reject them loudly rather than doing the wrong thing.
 *
 * Scope is deliberately limited to the actions reported broken:
 * `openInApp`, `openInFinder`, `openUrl`. Line/column-aware `openFileInEditor`
 * and clipboard actions stay desktop-only.
 */

const ExternalAppSchema = z.enum(EXTERNAL_APPS);

/**
 * Only runs when the host service is executing on the same machine as the
 * requesting desktop client. `getHostId()` is this host's stable machine id;
 * `ctx.clientMachineId` is sent by the desktop as `x-superset-client-machine-id`
 * and is the id the desktop compares against for local workspaces.
 */
const localOnlyProcedure = protectedProcedure.use(({ ctx, next }) => {
	if (!ctx.clientMachineId || ctx.clientMachineId !== getHostId()) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"External open actions are only available on the local host machine.",
		});
	}
	return next();
});

/**
 * Opens a path/URL with the OS default handler. Pure Node (no Electron
 * `shell`). Only macOS (`open`) and Linux (`xdg-open`) are handled, matching
 * the desktop's `getAppCommand` platform support — the target is never routed
 * through `cmd.exe`, which would treat `&`/`|` in a URL or path as command
 * separators.
 */
function openWithOsDefault(target: string): Promise<void> {
	if (process.platform === "darwin") {
		return spawnAsync("open", [target]);
	}
	return spawnAsync("xdg-open", [target]);
}

/** Reveals a path in the OS file manager, selecting it where supported. */
function revealInFileManager(targetPath: string): Promise<void> {
	if (process.platform === "darwin") {
		return spawnAsync("open", ["-R", targetPath]);
	}
	// Linux file managers have no universal "reveal & select"; open the
	// containing directory so the item is visible instead of opening the file
	// itself in its default app.
	return spawnAsync("xdg-open", [nodePath.dirname(targetPath)]);
}

/**
 * Rejects relative paths, which would otherwise be resolved against the
 * host-service working directory rather than the caller's intended location.
 */
function assertAbsolutePath(action: string, path: string): void {
	if (!path.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(path)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${action} requires an absolute path (got ${JSON.stringify(path)}).`,
		});
	}
}

/** Allowlisted URL schemes, mirroring the desktop's safe-url guard. */
const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isSafeExternalUrl(input: string): boolean {
	try {
		return SAFE_URL_SCHEMES.has(new URL(input).protocol);
	} catch {
		return false;
	}
}

export const externalRouter = router({
	openInApp: localOnlyProcedure
		.input(
			z.object({
				path: z.string(),
				app: ExternalAppSchema,
				projectId: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			assertAbsolutePath("openInApp", input.path);

			if (input.app === "finder") {
				await revealInFileManager(input.path);
				return;
			}

			const candidates = getAppCommand(input.app, input.path);
			if (!candidates) {
				await openWithOsDefault(input.path);
				return;
			}

			let lastError: Error | undefined;
			for (const cmd of candidates) {
				try {
					await spawnAsync(cmd.command, cmd.args);
					return;
				} catch (error) {
					lastError = error instanceof Error ? error : new Error(String(error));
				}
			}
			if (lastError) {
				throw lastError;
			}
		}),

	openInFinder: localOnlyProcedure
		.input(z.string())
		.mutation(async ({ input }) => {
			assertAbsolutePath("openInFinder", input);
			await revealInFileManager(input);
		}),

	openUrl: localOnlyProcedure.input(z.string()).mutation(async ({ input }) => {
		if (!isSafeExternalUrl(input)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "URL scheme not allowed",
			});
		}
		await openWithOsDefault(input);
	}),
});
