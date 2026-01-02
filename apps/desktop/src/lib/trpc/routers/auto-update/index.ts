import { observable } from "@trpc/server/observable";
import { app } from "electron";
import {
	type AutoUpdateStatusEvent,
	autoUpdateEmitter,
	checkForUpdates,
	checkForUpdatesInteractive,
	dismissUpdate,
	getUpdateStatus,
	installUpdate,
	simulateDownloading,
	simulateError,
	simulateUpdateReady,
} from "main/lib/auto-updater";
import { publicProcedure, router } from "../..";

export const createAutoUpdateRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<AutoUpdateStatusEvent>((emit) => {
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

		getVersion: publicProcedure.query(() => {
			return app.getVersion();
		}),

		check: publicProcedure.mutation(() => {
			checkForUpdates();
		}),

		checkForUpdates: publicProcedure.mutation(() => {
			checkForUpdatesInteractive();
		}),

		install: publicProcedure.mutation(() => {
			installUpdate();
		}),

		dismiss: publicProcedure.mutation(() => {
			dismissUpdate();
		}),

		simulateReady: publicProcedure.mutation(() => {
			simulateUpdateReady();
		}),

		simulateDownloading: publicProcedure.mutation(() => {
			simulateDownloading();
		}),

		simulateError: publicProcedure.mutation(() => {
			simulateError();
		}),
	});
};
