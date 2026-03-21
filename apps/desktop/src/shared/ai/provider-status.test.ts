import { describe, expect, it } from "bun:test";
import {
	classifyProviderIssue,
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

	it("shows actionable remediation for unknown_error issues", () => {
		const diagnostic: ProviderDiagnostic = {
			providerId: "anthropic",
			issue: {
				code: "unknown_error",
				capability: "small_model_tasks",
				remediation: "try_again",
				message: "Anthropic could not complete this request",
			},
			updatedAt: Date.now(),
		};

		const status = deriveModelProviderStatus({
			providerId: "anthropic",
			authStatus: {
				authenticated: true,
				method: "api_key",
				source: "managed",
				issue: null,
			},
			diagnostic,
		});

		expect(status.connectionState).toBe("connected");
		expect(status.issue?.code).toBe("unknown_error");
		expect(status.capabilities.canGenerateWorkspaceTitle).toBe(false);
		expect(status.capabilities.canUseSmallModelTasks).toBe(false);
	});

	it("treats unauthenticated auth source as needs attention", () => {
		const status = deriveModelProviderStatus({
			providerId: "anthropic",
			authStatus: {
				authenticated: false,
				method: null,
				source: "managed",
				issue: null,
			},
		});

		expect(status.connectionState).toBe("needs_attention");
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

describe("classifyProviderIssue", () => {
	it("classifies 401 Unauthorized errors as authentication failures with add_api_key remediation", () => {
		const issue = classifyProviderIssue({
			providerId: "anthropic",
			errorMessage: "401 Unauthorized - Invalid API key provided",
		});

		expect(issue.code).not.toBe("unknown_error");
		expect(issue.remediation).toBe("add_api_key");
		expect(issue.message).toContain("Anthropic");
	});

	it("classifies invalid_api_key errors as authentication failures", () => {
		const issue = classifyProviderIssue({
			providerId: "anthropic",
			errorMessage:
				"Error: invalid_api_key - The API key provided is not valid",
		});

		expect(issue.code).not.toBe("unknown_error");
		expect(issue.remediation).toBe("add_api_key");
	});

	it("classifies 'unauthorized' errors as authentication failures", () => {
		const issue = classifyProviderIssue({
			providerId: "openai",
			errorMessage: "Unauthorized: incorrect API key",
		});

		expect(issue.code).not.toBe("unknown_error");
		expect(issue.remediation).toBe("add_api_key");
	});

	it("classifies 'authentication' errors as authentication failures", () => {
		const issue = classifyProviderIssue({
			providerId: "anthropic",
			errorMessage: "authentication_error: Invalid API key",
		});

		expect(issue.code).not.toBe("unknown_error");
		expect(issue.remediation).toBe("add_api_key");
	});

	it("classifies 'status: 401' errors as authentication failures", () => {
		const issue = classifyProviderIssue({
			providerId: "anthropic",
			errorMessage: "Request failed with status: 401",
		});

		expect(issue.code).not.toBe("unknown_error");
		expect(issue.remediation).toBe("add_api_key");
	});

	it("classifies 429 rate limit errors as quota_exceeded", () => {
		const issue = classifyProviderIssue({
			providerId: "anthropic",
			errorMessage: "Request failed with status: 429 - rate limit exceeded",
		});

		expect(issue.code).toBe("quota_exceeded");
		expect(issue.remediation).toBe("check_billing");
	});

	it("classifies 'rate_limit' errors as quota_exceeded", () => {
		const issue = classifyProviderIssue({
			providerId: "openai",
			errorMessage: "rate_limit_exceeded: Too many requests",
		});

		expect(issue.code).toBe("quota_exceeded");
		expect(issue.remediation).toBe("check_billing");
	});

	it("classifies existing error patterns correctly", () => {
		expect(
			classifyProviderIssue({
				providerId: "openai",
				errorMessage:
					"Missing scopes: api.responses.write. Insufficient permissions.",
			}).code,
		).toBe("missing_scope");

		expect(
			classifyProviderIssue({
				providerId: "anthropic",
				errorMessage: "quota exceeded",
			}).code,
		).toBe("quota_exceeded");

		expect(
			classifyProviderIssue({
				providerId: "anthropic",
				errorMessage: "forbidden",
			}).code,
		).toBe("forbidden");

		expect(
			classifyProviderIssue({
				providerId: "anthropic",
				errorMessage: "fetch failed",
			}).code,
		).toBe("network_error");
	});

	it("falls through to unknown_error for truly unrecognized errors", () => {
		const issue = classifyProviderIssue({
			providerId: "anthropic",
			errorMessage: "something completely unexpected happened",
		});

		expect(issue.code).toBe("unknown_error");
		expect(issue.remediation).toBe("try_again");
	});
});
