import { describe, expect, test } from "bun:test";
import { signedOutSessionState } from "./signedOutSessionState";

const refetch = async () => {};

interface StoreValue {
	data: { user: { id: string }; session: { id: string } } | null;
	error: { status: number; message: string } | null;
	isPending: boolean;
	isRefetching: boolean;
	refetch: typeof refetch;
}

describe("signedOutSessionState", () => {
	test("drops the user a failed session read left behind", () => {
		const next = signedOutSessionState<StoreValue>({
			data: { user: { id: "user-a" }, session: { id: "session-a" } },
			error: { status: 0, message: "Failed to fetch" },
			isPending: false,
			isRefetching: false,
			refetch,
		});

		expect(next.data).toBeNull();
		expect(next.error).toBeNull();
	});

	test("does not leave the routes waiting on a read that is still in flight", () => {
		const next = signedOutSessionState<StoreValue>({
			data: { user: { id: "user-a" }, session: { id: "session-a" } },
			error: null,
			isPending: true,
			isRefetching: true,
			refetch,
		});

		expect(next.isPending).toBe(false);
		expect(next.isRefetching).toBe(false);
	});

	test("keeps the rest of the store value", () => {
		const next = signedOutSessionState<StoreValue>({
			data: null,
			error: null,
			isPending: true,
			isRefetching: false,
			refetch,
		});

		expect(next.refetch).toBe(refetch);
	});
});
