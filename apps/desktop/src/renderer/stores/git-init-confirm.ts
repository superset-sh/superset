import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface GitInitConfirmState {
	isOpen: boolean;
	repoPath: string | null;
	/**
	 * Opens the confirm dialog and resolves `true` if the user agrees to
	 * `git init` the folder, `false` if they cancel/dismiss. Only one request
	 * can be in flight at a time — a second call resolves the prior request to
	 * `false` before opening fresh. Safe today because there is a single global
	 * dialog instance (rendered by the authenticated layout).
	 */
	request: (repoPath: string) => Promise<boolean>;
	resolve: (confirmed: boolean) => void;
	/**
	 * GitInitConfirmDialog registers itself while mounted. request() refuses to
	 * pend with no dialog to settle it — that hang froze onboarding (#6666).
	 */
	registerConsumer: () => () => void;
}

// Module-level resolver so the pending promise isn't stored in zustand state.
// The store drives the dialog's open/close UI; the resolver bridges the
// imperative request() call back to its caller.
let pendingResolve: ((confirmed: boolean) => void) | null = null;
let consumerCount = 0;

export const useGitInitConfirmStore = create<GitInitConfirmState>()(
	devtools(
		(set) => ({
			isOpen: false,
			repoPath: null,
			request: (repoPath) => {
				pendingResolve?.(false);
				pendingResolve = null;
				if (consumerCount === 0) {
					console.error(
						"[git-init-confirm] request() with no GitInitConfirmDialog mounted — resolving false instead of pending forever",
					);
					return Promise.resolve(false);
				}
				return new Promise<boolean>((resolve) => {
					pendingResolve = resolve;
					set({ isOpen: true, repoPath });
				});
			},
			resolve: (confirmed) => {
				const resolve = pendingResolve;
				pendingResolve = null;
				set({ isOpen: false, repoPath: null });
				resolve?.(confirmed);
			},
			registerConsumer: () => {
				consumerCount += 1;
				return () => {
					consumerCount -= 1;
					// Last dialog gone: settle a pending request so the caller's
					// busy state can't outlive its only resolver.
					if (consumerCount === 0) {
						const resolve = pendingResolve;
						pendingResolve = null;
						set({ isOpen: false, repoPath: null });
						resolve?.(false);
					}
				};
			},
		}),
		{ name: "git-init-confirm" },
	),
);

export const useRequestGitInitConfirm = () =>
	useGitInitConfirmStore((state) => state.request);
