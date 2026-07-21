import {
	sidebarStateScopeSchema,
	sidebarStateSnapshotSchema,
} from "@superset/client-state";
import {
	initializeSidebarState,
	readSidebarState,
	replaceSidebarState,
	watchSidebarState,
} from "@superset/client-state/store";
import { observable } from "@trpc/server/observable";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export function createSidebarStateRouter() {
	return router({
		get: publicProcedure
			.input(sidebarStateScopeSchema)
			.query(({ input }) => readSidebarState(SUPERSET_HOME_DIR, input)),

		initialize: publicProcedure
			.input(
				z.object({
					scope: sidebarStateScopeSchema,
					state: sidebarStateSnapshotSchema,
				}),
			)
			.mutation(({ input }) =>
				initializeSidebarState(SUPERSET_HOME_DIR, input.scope, input.state),
			),

		replace: publicProcedure
			.input(
				z.object({
					scope: sidebarStateScopeSchema,
					state: sidebarStateSnapshotSchema,
					expectedRevision: z.number().int().nonnegative().optional(),
				}),
			)
			.mutation(({ input }) =>
				replaceSidebarState(SUPERSET_HOME_DIR, input.scope, input.state, {
					expectedRevision: input.expectedRevision,
				}),
			),

		onChanged: publicProcedure
			.input(sidebarStateScopeSchema)
			.subscription(({ input }) =>
				observable<Awaited<ReturnType<typeof readSidebarState>>>((emit) => {
					let disposed = false;
					let stop: (() => void) | undefined;
					void watchSidebarState(SUPERSET_HOME_DIR, input, (state) => {
						if (!disposed) emit.next(state);
					})
						.then((cleanup) => {
							if (disposed) cleanup();
							else stop = cleanup;
						})
						.catch((error) => {
							if (!disposed) emit.error(error);
						});
					return () => {
						disposed = true;
						stop?.();
					};
				}),
			),
	});
}
