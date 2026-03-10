import { describe, expect, it } from "bun:test";
import {
	deriveModelProviderStatus,
	type ProviderDiagnostic,
} from "./provider-status";

describe("deriveModelProviderStatus", () => {
	it("keeps a connected provider connected when only capability diagnostics fail", () => {
		const diagnostic: ProviderDiagnostic = {
			providerId: "openai",
			issue: {
				code: "missing_scope",
				capability: "small_model_tasks",
				remediation: "check_permissions",
				scope: "api.responses.write",
				message: "OpenAI needs permission api.responses.write",
			},
			updatedAt: Date.now(),
		};

		const status = deriveModelProviderStatus({
			providerId: "openai",
			authStatus: {
				authenticated: true,
				method: "oauth",
				source: "managed",
				issue: null,
			},
			diagnostic,
		});

		expect(status.connectionState).toBe("connected");
		expect(status.issue?.code).toBe("missing_scope");
		expect(status.capabilities.canUseChat).toBe(true);
		expect(status.capabilities.canGenerateWorkspaceTitle).toBe(false);
		expect(status.capabilities.canUseSmallModelTasks).toBe(false);
	});

	it("treats expired auth as needs attention and disables all capabilities", () => {
		const status = deriveModelProviderStatus({
			providerId: "anthropic",
			authStatus: {
				authenticated: false,
				method: "oauth",
				source: "external",
				issue: "expired",
			},
		});

		expect(status.connectionState).toBe("needs_attention");
		expect(status.issue?.code).toBe("expired");
		expect(status.capabilities).toEqual({
			canUseChat: false,
			canGenerateWorkspaceTitle: false,
			canUseSmallModelTasks: false,
		});
	});
});
