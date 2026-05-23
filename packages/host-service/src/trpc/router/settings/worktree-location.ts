import { eq } from "drizzle-orm";
import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import {
	defaultWorktreesRoot,
	normalizeWorktreeBaseDir,
} from "../workspace-creation/shared/worktree-paths";

const HOST_SETTINGS_ID = 1;
const LEGACY_WORKTREE_BASE_DIR_ENV = "SUPERSET_LEGACY_WORKTREE_BASE_DIR";

export interface HostWorktreeLocationSettings {
	worktreeBaseDir: string | null;
	defaultWorktreeBaseDir: string;
	effectiveWorktreeBaseDir: string;
}

function getLegacyWorktreeBaseDir(): string | null {
	const legacyPath = process.env[LEGACY_WORKTREE_BASE_DIR_ENV];
	if (!legacyPath) return null;
	try {
		return normalizeWorktreeBaseDir(legacyPath);
	} catch (err) {
		console.warn("[settings.worktreeLocation] ignored legacy worktree path", {
			legacyPath,
			err,
		});
		return null;
	}
}

function toOutput(
	worktreeBaseDir: string | null,
): HostWorktreeLocationSettings {
	const defaultWorktreeBaseDir = defaultWorktreesRoot();
	return {
		worktreeBaseDir,
		defaultWorktreeBaseDir,
		effectiveWorktreeBaseDir: worktreeBaseDir ?? defaultWorktreeBaseDir,
	};
}

export function getHostWorktreeBaseDir(
	ctx: Pick<HostServiceContext, "db">,
): string | null {
	const existing = ctx.db
		.select({ worktreeBaseDir: hostSettings.worktreeBaseDir })
		.from(hostSettings)
		.where(eq(hostSettings.id, HOST_SETTINGS_ID))
		.get();
	if (existing) return existing.worktreeBaseDir ?? null;

	const legacyWorktreeBaseDir = getLegacyWorktreeBaseDir();
	ctx.db
		.insert(hostSettings)
		.values({
			id: HOST_SETTINGS_ID,
			worktreeBaseDir: legacyWorktreeBaseDir,
		})
		.run();
	return legacyWorktreeBaseDir;
}

export function getEffectiveWorktreeBaseDir(args: {
	ctx: Pick<HostServiceContext, "db">;
	projectWorktreeBaseDir?: string | null;
}): string {
	return (
		args.projectWorktreeBaseDir ??
		getHostWorktreeBaseDir(args.ctx) ??
		defaultWorktreesRoot()
	);
}

export const worktreeLocationRouter = router({
	get: protectedProcedure.query(({ ctx }) =>
		toOutput(getHostWorktreeBaseDir(ctx)),
	),

	set: protectedProcedure
		.input(z.object({ path: z.string().nullable() }))
		.mutation(({ ctx, input }) => {
			const worktreeBaseDir = normalizeWorktreeBaseDir(input.path);
			ctx.db
				.insert(hostSettings)
				.values({
					id: HOST_SETTINGS_ID,
					worktreeBaseDir,
				})
				.onConflictDoUpdate({
					target: hostSettings.id,
					set: { worktreeBaseDir },
				})
				.run();
			return toOutput(worktreeBaseDir);
		}),
});
