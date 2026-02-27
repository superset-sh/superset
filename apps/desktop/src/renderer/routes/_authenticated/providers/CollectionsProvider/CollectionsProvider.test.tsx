import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const preloadCollectionsMock = mock(() => Promise.resolve());

mock.module("./collections", () => ({
	getCollections: mock(() => ({})),
	preloadCollections: preloadCollectionsMock,
}));

const { preloadActiveOrganizationCollections } = await import(
	"./CollectionsProvider"
);

describe("preloadActiveOrganizationCollections", () => {
	const originalConsoleError = console.error;

	beforeEach(() => {
		preloadCollectionsMock.mockReset();
		preloadCollectionsMock.mockImplementation(() => Promise.resolve());
		console.error = mock(() => undefined);
	});

	afterEach(() => {
		console.error = originalConsoleError;
	});

	it("preloads active org collections with includeChatCollections disabled", () => {
		preloadActiveOrganizationCollections("org-123");

		expect(preloadCollectionsMock).toHaveBeenCalledWith("org-123", {
			includeChatCollections: false,
		});
	});

	it("logs preload errors from fire-and-forget call", async () => {
		const error = new Error("boom");
		preloadCollectionsMock.mockImplementation(() => Promise.reject(error));

		preloadActiveOrganizationCollections("org-123");
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(console.error).toHaveBeenCalledWith(
			"[collections-provider] Failed to preload active org collections:",
			error,
		);
	});
});
