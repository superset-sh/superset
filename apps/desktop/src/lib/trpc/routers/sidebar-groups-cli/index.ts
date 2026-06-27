import {
	acknowledgeSidebarGroupsCliOperation,
	readNextSidebarGroupsCliOperation,
	releaseSidebarGroupsCliOperation,
	SidebarGroupsCliStateLockTimeoutError,
	sidebarGroupsCliSnapshotSchema,
	writeSidebarGroupsCliSnapshot,
} from "@superset/shared/sidebar-groups-cli";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const organizationInput = z.object({ organizationId: z.string() });

export const createSidebarGroupsCliRouter = () => {
	return router({
		writeSnapshot: publicProcedure
			.input(
				z.object({
					organizationId: z.string(),
					snapshot: sidebarGroupsCliSnapshotSchema,
				}),
			)
			.mutation(({ input }) => {
				try {
					writeSidebarGroupsCliSnapshot(
						{
							homeDir: SUPERSET_HOME_DIR,
							organizationId: input.organizationId,
						},
						input.snapshot,
						{ waitMs: 0 },
					);
					return { success: true };
				} catch (error) {
					if (error instanceof SidebarGroupsCliStateLockTimeoutError) {
						return { success: false, reason: "locked" };
					}
					throw error;
				}
			}),

		readOperation: publicProcedure
			.input(organizationInput)
			.mutation(({ input }) => {
				try {
					return {
						operation: readNextSidebarGroupsCliOperation(
							{
								homeDir: SUPERSET_HOME_DIR,
								organizationId: input.organizationId,
							},
							{ waitMs: 0 },
						),
					};
				} catch (error) {
					if (error instanceof SidebarGroupsCliStateLockTimeoutError) {
						return { operation: null };
					}
					throw error;
				}
			}),

		ackOperation: publicProcedure
			.input(z.object({ organizationId: z.string(), operationId: z.string() }))
			.mutation(({ input }) => {
				try {
					return {
						success: acknowledgeSidebarGroupsCliOperation(
							{
								homeDir: SUPERSET_HOME_DIR,
								organizationId: input.organizationId,
							},
							input.operationId,
							{ waitMs: 0 },
						),
					};
				} catch (error) {
					if (error instanceof SidebarGroupsCliStateLockTimeoutError) {
						return { success: false, reason: "locked" };
					}
					throw error;
				}
			}),

		releaseOperation: publicProcedure
			.input(z.object({ organizationId: z.string(), operationId: z.string() }))
			.mutation(({ input }) => {
				try {
					return {
						success: releaseSidebarGroupsCliOperation(
							{
								homeDir: SUPERSET_HOME_DIR,
								organizationId: input.organizationId,
							},
							input.operationId,
							{ waitMs: 0 },
						),
					};
				} catch (error) {
					if (error instanceof SidebarGroupsCliStateLockTimeoutError) {
						return { success: false, reason: "locked" };
					}
					throw error;
				}
			}),
	});
};

export type SidebarGroupsCliRouter = ReturnType<
	typeof createSidebarGroupsCliRouter
>;
