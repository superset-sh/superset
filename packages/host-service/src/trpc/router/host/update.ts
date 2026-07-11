import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	acquireUpdateLock,
	classifyUpdateTarget,
	clearUpdateResult,
	getHostUpdateStatus,
	HOST_SERVICE_VERSION,
	isInstallableUpdateVersion,
	releaseUpdateLock,
	spawnUpdateSupervisor,
	supportsRemoteUpdate,
	terminateUpdateSupervisor,
	transferUpdateLock,
	writeUpdateResult,
} from "../../../runtime/update";
import { protectedProcedure, router } from "../../index";

const targetVersionSchema = z.string().refine(isInstallableUpdateVersion, {
	message:
		"Expected MAJOR.MINOR.PATCH with an optional prerelease suffix and no build metadata",
});

export const hostUpdateRouter = router({
	start: protectedProcedure
		.input(z.object({ targetVersion: targetVersionSchema }))
		.mutation(({ ctx, input }) => {
			if (!supportsRemoteUpdate()) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Remote update is not supported by this host install",
				});
			}

			const disposition = classifyUpdateTarget(
				HOST_SERVICE_VERSION,
				input.targetVersion,
			);
			if (disposition === "downgrade") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Refusing to downgrade host from ${HOST_SERVICE_VERSION} to ${input.targetVersion}`,
				});
			}

			const currentStatus = getHostUpdateStatus({
				organizationId: ctx.organizationId,
			});
			if (currentStatus.status === "updating") {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Update to ${currentStatus.targetVersion} is already in progress`,
				});
			}

			if (disposition === "satisfied") {
				clearUpdateResult(ctx.organizationId);
				writeUpdateResult(ctx.organizationId, {
					status: "succeeded",
					targetVersion: input.targetVersion,
					previousVersion: HOST_SERVICE_VERSION,
					finalVersion: HOST_SERVICE_VERSION,
					completedAt: Date.now(),
				});
				return {
					outcome: "satisfied" as const,
					previousVersion: HOST_SERVICE_VERSION,
					newVersion: HOST_SERVICE_VERSION,
					targetVersion: input.targetVersion,
					supervisorPid: null,
				};
			}

			const acquired = acquireUpdateLock({
				organizationId: ctx.organizationId,
				ownerPid: process.pid,
				targetVersion: input.targetVersion,
				previousVersion: HOST_SERVICE_VERSION,
			});
			if (!acquired.acquired) {
				throw new TRPCError({
					code: "CONFLICT",
					message: acquired.lock
						? `Update to ${acquired.lock.targetVersion} is already in progress`
						: "Another update is already in progress",
				});
			}

			clearUpdateResult(ctx.organizationId);
			let supervisorPid: number | null = null;
			try {
				const supervisor = spawnUpdateSupervisor({
					organizationId: ctx.organizationId,
					oldPid: process.pid,
					targetVersion: input.targetVersion,
				});
				supervisorPid = supervisor.supervisorPid;
				transferUpdateLock({
					organizationId: ctx.organizationId,
					fromPid: process.pid,
					toPid: supervisor.supervisorPid,
				});
			} catch (error) {
				if (supervisorPid !== null) {
					terminateUpdateSupervisor(supervisorPid);
				}
				releaseUpdateLock({
					organizationId: ctx.organizationId,
					ownerPid: process.pid,
				});
				writeUpdateResult(ctx.organizationId, {
					status: "failed",
					targetVersion: input.targetVersion,
					previousVersion: HOST_SERVICE_VERSION,
					error:
						error instanceof Error
							? error.message
							: "Failed to start update supervisor",
					completedAt: Date.now(),
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to start update supervisor",
					cause: error,
				});
			}

			return {
				outcome: "dispatched" as const,
				previousVersion: HOST_SERVICE_VERSION,
				newVersion: null,
				targetVersion: input.targetVersion,
				supervisorPid,
			};
		}),

	status: protectedProcedure.query(({ ctx }) =>
		getHostUpdateStatus({ organizationId: ctx.organizationId }),
	),
});
