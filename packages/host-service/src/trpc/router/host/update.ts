import { existsSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "../../../env";
import {
	acquireUpdateLock,
	releaseUpdateLock,
	resolveSupervisorBinary,
	spawnUpdateSupervisor,
} from "../../../runtime/update";
import { protectedProcedure, router } from "../../index";

const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?$/;
const SELF_EXIT_DELAY_MS = 1_500;

let lastUpdateAt = 0;
const HOST_RATE_LIMIT_MS = 60_000;

export const hostUpdateRouter = router({
	start: protectedProcedure
		.input(
			z.object({
				targetVersion: z.string().regex(SEMVER_RE).nullable(),
			}),
		)
		.mutation(({ input }) => {
			if (!existsSync(resolveSupervisorBinary())) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"Remote update is not supported by this host (supervisor binary missing)",
				});
			}

			if (Date.now() - lastUpdateAt < HOST_RATE_LIMIT_MS) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message: "Update already triggered recently on this host",
				});
			}

			const currentVersion = env.SUPERSET_VERSION;
			if (input.targetVersion && currentVersion === input.targetVersion) {
				return {
					outcome: "satisfied" as const,
					previousVersion: currentVersion,
					newVersion: currentVersion,
					supervisorPid: null,
				};
			}

			const lock = acquireUpdateLock(env.ORGANIZATION_ID, process.pid);
			if (!lock.acquired) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Update already in progress (held by pid ${lock.heldBy})`,
				});
			}

			let supervisor: { supervisorPid: number };
			try {
				supervisor = spawnUpdateSupervisor({
					organizationId: env.ORGANIZATION_ID,
					oldPid: process.pid,
					targetVersion: input.targetVersion,
				});
			} catch (err) {
				releaseUpdateLock(env.ORGANIZATION_ID);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						err instanceof Error
							? err.message
							: "Failed to spawn update supervisor",
				});
			}

			lastUpdateAt = Date.now();

			// Self-exit *after* this response flushes through the tunnel; the
			// supervisor is detached and will respawn the daemon onto the new
			// binary.
			setTimeout(() => {
				try {
					process.kill(process.pid, "SIGTERM");
				} catch {
					// best-effort
				}
			}, SELF_EXIT_DELAY_MS);

			return {
				outcome: "dispatched" as const,
				previousVersion: currentVersion,
				newVersion: null,
				supervisorPid: supervisor.supervisorPid,
			};
		}),
});
