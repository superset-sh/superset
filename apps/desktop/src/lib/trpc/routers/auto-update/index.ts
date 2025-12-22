import { observable } from "@trpc/server/observable";
import {
	autoUpdateEmitter,
	checkForUpdates,
	dismissUpdate,
	getUpdateStatus,
	installUpdate,
	simulateUpdateReady,
} from "main/lib/auto-updater";
import { AUTO_UPDATE_EVENTS, type AutoUpdateStatus } from "shared/constants";
import { publicProcedure, router } from "../..";

export interface AutoUpdateEvent {
	type: typeof AUTO_UPDATE_EVENTS.STATUS_CHANGED;
	status: AutoUpdateStatus;
	version?: string;
	error?: string;
}

export const createAutoUpdateRouter = () => {
	return router({
		/**
		 * Subscribe to auto-update status changes
		 */
		subscribe: publicProcedure.subscription(() => {
			return observable<AutoUpdateEvent>((emit) => {
				// Emit current status immediately on subscribe
				const currentStatus = getUpdateStatus();
				emit.next({
					type: AUTO_UPDATE_EVENTS.STATUS_CHANGED,
					...currentStatus,
				});

				const onStatusChanged = (data: {
					status: AutoUpdateStatus;
					version?: string;
					error?: string;
				}) => {
					emit.next({ type: AUTO_UPDATE_EVENTS.STATUS_CHANGED, ...data });
				};

				autoUpdateEmitter.on(
					AUTO_UPDATE_EVENTS.STATUS_CHANGED,
					onStatusChanged,
				);

				return () => {
					autoUpdateEmitter.off(
						AUTO_UPDATE_EVENTS.STATUS_CHANGED,
						onStatusChanged,
					);
				};
			});
		}),

		/**
		 * Get current update status
		 */
		getStatus: publicProcedure.query(() => {
			return getUpdateStatus();
		}),

		/**
		 * Trigger install and restart
		 */
		installAndRestart: publicProcedure.mutation(() => {
			installUpdate();
			return { success: true };
		}),

		/**
		 * Dismiss the update notification for this session
		 */
		dismiss: publicProcedure.mutation(() => {
			dismissUpdate();
			return { success: true };
		}),

		/**
		 * Check for updates manually
		 */
		checkForUpdates: publicProcedure.mutation(() => {
			checkForUpdates();
			return { success: true };
		}),

		/**
		 * DEV ONLY: Simulate an update ready state for testing the UI
		 */
		simulateUpdateReady: publicProcedure.mutation(() => {
			simulateUpdateReady();
			return { success: true };
		}),
	});
};
