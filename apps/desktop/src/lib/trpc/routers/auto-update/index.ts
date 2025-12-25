import { observable } from "@trpc/server/observable";
import {
	type AutoUpdateStatusEvent,
	autoUpdateEmitter,
	dismissUpdate,
	getUpdateStatus,
	installUpdate,
	simulateDownloading,
	simulateUpdateReady,
} from "main/lib/auto-updater";
import { publicProcedure, router } from "../..";

export const createAutoUpdateRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<AutoUpdateStatusEvent>((emit) => {
				// Emit current status immediately
				emit.next(getUpdateStatus());

				const onStatusChanged = (event: AutoUpdateStatusEvent) => {
					emit.next(event);
				};

				autoUpdateEmitter.on("status-changed", onStatusChanged);

				return () => {
					autoUpdateEmitter.off("status-changed", onStatusChanged);
				};
			});
		}),

		getStatus: publicProcedure.query(() => {
			return getUpdateStatus();
		}),

		install: publicProcedure.mutation(() => {
			installUpdate();
		}),

		dismiss: publicProcedure.mutation(() => {
			dismissUpdate();
		}),

		// DEV ONLY
		simulateReady: publicProcedure.mutation(() => {
			simulateUpdateReady();
		}),

		simulateDownloading: publicProcedure.mutation(() => {
			simulateDownloading();
		}),
	});
};
