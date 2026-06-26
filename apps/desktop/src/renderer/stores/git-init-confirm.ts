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
	 * dialog instance (rendered by AddRepositoryModals).
	 */
	request: (repoPath: string) => Promise<boolean>;
	resolve: (confirmed: boolean) => void;
}

// Module-level resolver so the pending promise isn't stored in zustand state.
// The store drives the dialog's open/close UI; the resolver bridges the
// imperative request() call back to its caller.
let pendingResolve: ((confirmed: boolean) => void) | null = null;

export const useGitInitConfirmStore = create<GitInitConfirmState>()(
	devtools(
		(set) => ({
			isOpen: false,
			repoPath: null,
			request: (repoPath) => {
				pendingResolve?.(false);
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
		}),
		{ name: "git-init-confirm" },
	),
);

export const useRequestGitInitConfirm = () =>
	useGitInitConfirmStore((state) => state.request);
