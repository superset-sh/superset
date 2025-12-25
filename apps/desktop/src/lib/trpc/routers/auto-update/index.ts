import { observable } from "@trpc/server/observable";
import {
	autoUpdateEmitter,
	installUpdate,
	type UpdateDownloadedEvent,
} from "main/lib/auto-updater";
import { publicProcedure, router } from "../..";

export type AutoUpdateEvent =
	| {
			type: "update-downloaded";
			data: UpdateDownloadedEvent;
	  }
	| { type: "update-not-available" };

export const createAutoUpdateRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<AutoUpdateEvent>((emit) => {
				const onUpdateDownloaded = (data: UpdateDownloadedEvent) => {
					emit.next({ type: "update-downloaded", data });
				};

				const onUpdateNotAvailable = () => {
					emit.next({ type: "update-not-available" });
				};

				autoUpdateEmitter.on("update-downloaded", onUpdateDownloaded);
				autoUpdateEmitter.on("update-not-available", onUpdateNotAvailable);

				return () => {
					autoUpdateEmitter.off("update-downloaded", onUpdateDownloaded);
					autoUpdateEmitter.off("update-not-available", onUpdateNotAvailable);
				};
			});
		}),
		installUpdate: publicProcedure.mutation(() => {
			installUpdate();
		}),
	});
};
