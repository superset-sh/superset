import { describe, expect, test } from "bun:test";
import {
	clearPendingDeleteDialogOpen,
	scheduleDeleteDialogOpen,
} from "./useWorkspaceDeleteHandler";

describe("useWorkspaceDeleteHandler utilities", () => {
	test("clearPendingDeleteDialogOpen is a no-op when there is no pending timer", () => {
		const pendingTimerRef = {
			current: null as ReturnType<typeof setTimeout> | null,
		};
		let clearCalls = 0;

		clearPendingDeleteDialogOpen(pendingTimerRef, () => {
			clearCalls += 1;
		});

		expect(clearCalls).toBe(0);
		expect(pendingTimerRef.current).toBeNull();
	});

	test("scheduleDeleteDialogOpen stores pending timer and clears previous timer", () => {
		const timerA = Symbol("timer-a") as unknown as ReturnType<
			typeof setTimeout
		>;
		const timerB = Symbol("timer-b") as unknown as ReturnType<
			typeof setTimeout
		>;
		const pendingTimerRef = { current: timerA };
		const clearedTimers: Array<ReturnType<typeof setTimeout>> = [];
		let deferredSetShowDeleteDialog: ((show: boolean) => void) | undefined;
		let setShowDeleteDialogCalls = 0;

		scheduleDeleteDialogOpen({
			pendingTimerRef,
			setShowDeleteDialog: () => {
				setShowDeleteDialogCalls += 1;
			},
			deferOpen: (setShowDeleteDialog) => {
				deferredSetShowDeleteDialog = setShowDeleteDialog;
				return timerB;
			},
			clearTimer: (timer) => {
				clearedTimers.push(timer);
			},
		});

		expect(clearedTimers).toEqual([timerA]);
		expect(pendingTimerRef.current).toBe(timerB);
		expect(setShowDeleteDialogCalls).toBe(0);

		deferredSetShowDeleteDialog?.(true);

		expect(setShowDeleteDialogCalls).toBe(1);
		expect(pendingTimerRef.current).toBeNull();
	});

	test("clearPendingDeleteDialogOpen clears timer and resets ref", () => {
		const timer = Symbol("timer") as unknown as ReturnType<typeof setTimeout>;
		const pendingTimerRef = { current: timer };
		const clearedTimers: Array<ReturnType<typeof setTimeout>> = [];

		clearPendingDeleteDialogOpen(pendingTimerRef, (clearedTimer) => {
			clearedTimers.push(clearedTimer);
		});

		expect(clearedTimers).toEqual([timer]);
		expect(pendingTimerRef.current).toBeNull();
	});
});
