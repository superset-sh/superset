import { describe, expect, it, mock } from "bun:test";
import type { UsageAccount } from "../trpc/router/usage/types.ts";
import type { AccountEngine } from "./account-engine.ts";
import {
	type AccountServicePointers,
	createLocalAccountService,
} from "./account-service.ts";
import type { QuotaStore } from "./quota-store.ts";

describe("pointer-only manual activation", () => {
	for (const agent of ["claude", "codex"] as const) {
		for (const status of [
			"signed_out",
			"token_expired",
			"token_stale",
			"unavailable",
			"ok",
		] as const) {
			it(`${agent}: validates ${status} before writing the pointer`, async () => {
				const setSelection = mock(() => {});
				const engine = {
					status: () => ({
						claude: { platformSupported: false },
						codex: { platformSupported: false },
					}),
					// Provisioning is independent of the activation validation under test.
					runExclusive: async () => {},
				} as unknown as AccountEngine;
				const service = createLocalAccountService(
					engine,
					{
						read: async () => [
							{ agent, selection: "/profile", status } as UsageAccount,
						],
					} as unknown as QuotaStore,
					{ setSelection } as unknown as AccountServicePointers,
				);
				if (status === "signed_out" || status === "token_expired") {
					await expect(
						service.switchManually(agent, "/profile"),
					).rejects.toThrow("no-target-login");
					expect(setSelection).not.toHaveBeenCalled();
				} else {
					await service.switchManually(agent, "/profile");
					expect(setSelection).toHaveBeenCalledWith(agent, "/profile");
				}
			});
		}
	}
});
