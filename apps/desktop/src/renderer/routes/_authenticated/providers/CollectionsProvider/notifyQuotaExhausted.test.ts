import { afterAll, describe, expect, it } from "bun:test";
import { toast } from "@superset/ui/sonner";

interface ToastCall {
	level: "warning" | "success";
	title: string;
	options?: {
		id?: string;
		description?: string;
		action?: { label: string; onClick: () => void };
	};
}

const toastCalls: ToastCall[] = [];

// The implementation is intercepted by patching the real `toast` object's
// methods, not by `mock.module`: whichever test file loads first, the
// implementation holds a binding to this same object, so the patch applies
// even when another file already imported the implementation transitively
// (mock.module registered here would come too late in that order).
// `terminal-buffer-gc` is deliberately left alone so its own test file never
// asserts against a stub.
const realWarning = toast.warning;
const realSuccess = toast.success;
toast.warning = ((title: string, options?: ToastCall["options"]) => {
	toastCalls.push({ level: "warning", title, options });
}) as typeof toast.warning;
toast.success = ((title: string, options?: ToastCall["options"]) => {
	toastCalls.push({ level: "success", title, options });
}) as typeof toast.success;
afterAll(() => {
	toast.warning = realWarning;
	toast.success = realSuccess;
});

const { describeClearedSnapshots, notifyQuotaExhausted } = await import(
	"./notifyQuotaExhausted"
);

/** Silences the deduped warning so assertions read only the toast behaviour. */
function withSilencedWarnings(run: () => void): string[] {
	const warnings: string[] = [];
	const realWarn = console.warn;
	console.warn = (message: string) => warnings.push(message);
	try {
		run();
	} finally {
		console.warn = realWarn;
	}
	return warnings;
}

function reset(): void {
	toastCalls.length = 0;
}

describe("notifyQuotaExhausted", () => {
	it("warns once per storage key, however often the write fails", () => {
		reset();

		const warnings = withSilencedWarnings(() => {
			notifyQuotaExhausted("warn-dedupe-a", "silent");
			notifyQuotaExhausted("warn-dedupe-a", "silent");
			notifyQuotaExhausted("warn-dedupe-a", "silent");
			notifyQuotaExhausted("warn-dedupe-b", "silent");
		});

		// The loop this replaced fired ~40x a second, so an un-deduped log would
		// just relocate the problem.
		expect(warnings).toHaveLength(2);
		expect(warnings[0]).toContain("warn-dedupe-a");
		expect(warnings[1]).toContain("warn-dedupe-b");
	});

	it("raises no toast in silent mode", () => {
		reset();

		withSilencedWarnings(() => notifyQuotaExhausted("silent-key", "silent"));

		expect(toastCalls).toHaveLength(0);
	});

	it("explains the consequence in notify mode, without an action", () => {
		reset();

		withSilencedWarnings(() => notifyQuotaExhausted("notify-key", "notify"));

		expect(toastCalls).toHaveLength(1);
		expect(toastCalls[0]?.level).toBe("warning");
		expect(toastCalls[0]?.title).toBe("Storage is full");
		expect(toastCalls[0]?.options?.description).toContain("revert");
		expect(toastCalls[0]?.options?.action).toBeUndefined();
	});

	it("reuses one toast id so a later failure can re-raise a dismissed toast", () => {
		reset();

		withSilencedWarnings(() => {
			notifyQuotaExhausted("toast-id-a", "notify");
			notifyQuotaExhausted("toast-id-b", "notify");
		});

		expect(toastCalls[0]?.options?.id).toBeTruthy();
		expect(toastCalls[1]?.options?.id).toBe(
			toastCalls[0]?.options?.id as string,
		);
	});

	it("offers the reclaim action only in offer-reclaim mode", () => {
		reset();

		withSilencedWarnings(() =>
			notifyQuotaExhausted("offer-key", "offer-reclaim"),
		);

		expect(toastCalls[0]?.options?.action?.label).toBe("Free up space");
	});
});

describe("describeClearedSnapshots", () => {
	it("says so plainly when there was nothing to clear", () => {
		expect(describeClearedSnapshots(0)).toBe(
			"No saved terminal scrollback left to clear",
		);
	});

	// The count is storage entries, not terminals: each terminal persists a
	// buffer and a dimensions key, so calling 2 entries "2 terminals" would
	// report double the real number.
	it("counts storage entries rather than terminals", () => {
		expect(describeClearedSnapshots(2)).toContain("2 saved terminal entries");
		expect(describeClearedSnapshots(2)).not.toContain("terminals");
	});

	it("singularises a single entry", () => {
		expect(describeClearedSnapshots(1)).toContain("1 saved terminal entry");
		expect(describeClearedSnapshots(1)).not.toContain("entries");
	});
});
