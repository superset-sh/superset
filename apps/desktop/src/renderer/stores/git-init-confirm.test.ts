import { describe, expect, it } from "bun:test";
import { useGitInitConfirmStore } from "./git-init-confirm";

// Regression test for #6666: on routes that never mounted GitInitConfirmDialog
// (v2 onboarding, File→Open Folder outside the dashboard), request() pended
// forever and left the caller's busy state locked.
describe("useGitInitConfirmStore", () => {
	it("resolves false instead of pending forever when no dialog is mounted", async () => {
		const result = await Promise.race([
			useGitInitConfirmStore.getState().request("/tmp/not-a-repo"),
			new Promise((resolve) => setTimeout(() => resolve("pending"), 250)),
		]);
		expect(result).toBe(false);
		expect(useGitInitConfirmStore.getState().isOpen).toBe(false);
	});

	it("opens and settles via resolve() while a dialog is mounted", async () => {
		const unregister = useGitInitConfirmStore.getState().registerConsumer();
		try {
			const pending = useGitInitConfirmStore.getState().request("/tmp/repo");
			expect(useGitInitConfirmStore.getState().isOpen).toBe(true);
			expect(useGitInitConfirmStore.getState().repoPath).toBe("/tmp/repo");
			useGitInitConfirmStore.getState().resolve(true);
			expect(await pending).toBe(true);
			expect(useGitInitConfirmStore.getState().isOpen).toBe(false);
		} finally {
			unregister();
		}
	});

	it("falls back to auto-resolving once the last dialog unmounts", async () => {
		const unregister = useGitInitConfirmStore.getState().registerConsumer();
		unregister();
		const result = await Promise.race([
			useGitInitConfirmStore.getState().request("/tmp/not-a-repo"),
			new Promise((resolve) => setTimeout(() => resolve("pending"), 250)),
		]);
		expect(result).toBe(false);
	});

	it("settles a pending request with false when the last dialog unmounts", async () => {
		const unregister = useGitInitConfirmStore.getState().registerConsumer();
		const pending = useGitInitConfirmStore.getState().request("/tmp/repo");
		expect(useGitInitConfirmStore.getState().isOpen).toBe(true);
		unregister();
		expect(await pending).toBe(false);
		expect(useGitInitConfirmStore.getState().isOpen).toBe(false);
		expect(useGitInitConfirmStore.getState().repoPath).toBeNull();
	});
});
