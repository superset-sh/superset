import { beforeEach, describe, expect, mock, test } from "bun:test";

const AFTER_FIRST_UNLOCK = "afterFirstUnlock";
const NEW = {
	keychainService: "superset-auth",
	keychainAccessible: AFTER_FIRST_UNLOCK,
};

const getItem = mock((_key: string, _options?: object): string | null => null);
const setItem = mock((_key: string, _value: string, _options?: object) => true);
const deleteItemAsync = mock(async (_key: string, _options?: object) => {});

mock.module("expo-secure-store", () => ({
	AFTER_FIRST_UNLOCK,
	getItem,
	setItem,
	deleteItemAsync,
}));

const { sessionStorage } = await import("./sessionStorage");

beforeEach(() => {
	getItem.mockReset();
	setItem.mockReset();
	deleteItemAsync.mockReset();
	getItem.mockImplementation(() => null);
});

describe("sessionStorage", () => {
	test("reads the background-readable item without touching the legacy one", () => {
		getItem.mockImplementation((_key, options) =>
			options ? "new-value" : "legacy-value",
		);

		expect(sessionStorage.getItem("superset_cookie")).toBe("new-value");
		expect(getItem).toHaveBeenCalledTimes(1);
		expect(getItem).toHaveBeenCalledWith("superset_cookie", NEW);
		expect(setItem).not.toHaveBeenCalled();
	});

	test("moves a legacy item into the background-readable service on read", () => {
		getItem.mockImplementation((_key, options) =>
			options ? null : "legacy-value",
		);

		expect(sessionStorage.getItem("superset_cookie")).toBe("legacy-value");
		expect(setItem).toHaveBeenCalledWith(
			"superset_cookie",
			"legacy-value",
			NEW,
		);
		expect(deleteItemAsync).toHaveBeenCalledWith("superset_cookie");
	});

	test("a missing key is null and writes nothing", () => {
		expect(sessionStorage.getItem("superset_session_data")).toBeNull();
		expect(getItem).toHaveBeenCalledTimes(2);
		expect(setItem).not.toHaveBeenCalled();
		expect(deleteItemAsync).not.toHaveBeenCalled();
	});

	test("writes only to the background-readable service and drops the legacy copy", () => {
		sessionStorage.setItem("superset_cookie", "{}");

		expect(setItem).toHaveBeenCalledTimes(1);
		expect(setItem).toHaveBeenCalledWith("superset_cookie", "{}", NEW);
		expect(deleteItemAsync).toHaveBeenCalledTimes(1);
		expect(deleteItemAsync).toHaveBeenCalledWith("superset_cookie");
	});
});
