import { observable } from "@trpc/server/observable";
import {
	getKeyboardLayoutSnapshot,
	type KeyboardLayoutData,
	onKeyboardLayoutChange,
} from "main/lib/keyboardLayout";
import { publicProcedure, router } from "..";

export const createKeyboardLayoutRouter = () => {
	return router({
		get: publicProcedure.query((): KeyboardLayoutData => {
			return getKeyboardLayoutSnapshot();
		}),
		// observable (not async generator) per apps/desktop/AGENTS.md —
		// trpc-electron only supports observables for IPC subscriptions.
		changes: publicProcedure.subscription(() => {
			return observable<KeyboardLayoutData>((emit) => {
				// Prime the subscriber with the current snapshot so the renderer
				// store doesn't have to make a separate query on subscribe.
				emit.next(getKeyboardLayoutSnapshot());
				return onKeyboardLayoutChange((data) => emit.next(data));
			});
		}),
	});
};
