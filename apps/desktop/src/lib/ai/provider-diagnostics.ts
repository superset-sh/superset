import type {
	ProviderDiagnostic,
	ProviderId,
	ProviderIssue,
} from "shared/ai/provider-status";

const diagnostics = new Map<ProviderId, ProviderDiagnostic>();

function getEmptyDiagnostic(providerId: ProviderId): ProviderDiagnostic {
	return {
		providerId,
		issue: null,
		updatedAt: null,
	};
}

export function getProviderDiagnostic(
	providerId: ProviderId,
): ProviderDiagnostic {
	return diagnostics.get(providerId) ?? getEmptyDiagnostic(providerId);
}

export function getProviderDiagnostics(): ProviderDiagnostic[] {
	return [getProviderDiagnostic("anthropic"), getProviderDiagnostic("openai")];
}

export function reportProviderIssue(
	providerId: ProviderId,
	issue: ProviderIssue,
): void {
	diagnostics.set(providerId, {
		providerId,
		issue,
		updatedAt: Date.now(),
	});
}

export function clearProviderIssue(providerId: ProviderId): void {
	diagnostics.set(providerId, getEmptyDiagnostic(providerId));
}
