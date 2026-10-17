import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { downloadThemeStarter } from "./downloadThemeStarter";

const url = "blob:theme-starter";
const blob = new Blob(['{"id":"my-custom-theme"}'], {
	type: "application/json",
});
type Observer = Parameters<Parameters<typeof downloadThemeStarter>[1]>[0];
let observer: Observer;
const unsubscribe = mock(() => {});
const subscribe = (next: Observer) => {
	observer = next;
	return { unsubscribe };
};

beforeEach(() => {
	unsubscribe.mockClear();
	spyOn(URL, "createObjectURL").mockReturnValue(url);
	spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
	spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => mock.restore());

test("waits for this download to complete before releasing its URL", async () => {
	let completed = false;
	const result = downloadThemeStarter(blob, subscribe).then(() => {
		completed = true;
	});
	observer.onData([{ url: "blob:another-download", state: "completed" }]);
	observer.onData([{ url, state: "progressing" }]);
	await Promise.resolve();
	expect(completed).toBe(false);
	expect(URL.revokeObjectURL).not.toHaveBeenCalled();

	observer.onData([{ url, state: "completed" }]);
	await result;
	expect(completed).toBe(true);
	expect(unsubscribe).toHaveBeenCalledTimes(1);
	expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
});

test.each([
	"interrupted",
	"cancelled",
] as const)("rejects a %s download and releases its resources", async (state) => {
	const result = downloadThemeStarter(blob, subscribe);
	observer.onData([{ url, state }]);
	await expect(result).rejects.toThrow(`Theme download ${state}`);
	expect(unsubscribe).toHaveBeenCalledTimes(1);
	expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
});

test("observes a download that finished before the first snapshot", async () => {
	const result = downloadThemeStarter(blob, subscribe);
	observer.onData([{ url, state: "completed" }]);
	await expect(result).resolves.toBeUndefined();
});

test("rejects when the download observer fails", async () => {
	const result = downloadThemeStarter(blob, subscribe);
	observer.onError(new Error("Disconnected"));
	await expect(result).rejects.toThrow("Disconnected");
	expect(unsubscribe).toHaveBeenCalledTimes(1);
	expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
});

test("stops waiting if no completion arrives", async () => {
	await expect(downloadThemeStarter(blob, subscribe, 0)).rejects.toThrow(
		"Theme download timed out",
	);
	expect(unsubscribe).toHaveBeenCalledTimes(1);
	expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
});

test("cleans up when starting the download throws", async () => {
	spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
		throw new Error("Cannot start download");
	});
	await expect(downloadThemeStarter(blob, subscribe)).rejects.toThrow(
		"Cannot start download",
	);
	expect(document.querySelector('a[download="superset-theme-base.json"]')).toBe(
		null,
	);
	expect(unsubscribe).toHaveBeenCalledTimes(1);
	expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
});
