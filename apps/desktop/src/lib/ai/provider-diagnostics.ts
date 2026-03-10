import type {
	ProviderCapability,
	ProviderDiagnostic,
	ProviderId,
	ProviderIssue,
} from "shared/ai/provider-status";

const DIAGNOSTIC_CAPABILITIES: ProviderCapability[] = [
	"chat",
	"small_model_tasks",
	"workspace_titles",
];

const diagnostics = new Map<string, ProviderDiagnostic>();

function getDiagnosticKey(
	providerId: ProviderId,
	capability: ProviderCapability,
): string {
	return `${providerId}:${capability}`;
}

function getEmptyDiagnostic(providerId: ProviderId): ProviderDiagnostic {
	return {
		providerId,
		issue: null,
		updatedAt: null,
	};
}

export function getProviderDiagnostic(
	providerId: ProviderId,
	capability?: ProviderCapability,
): ProviderDiagnostic {
	if (capability) {
		return (
			diagnostics.get(getDiagnosticKey(providerId, capability)) ??
			getEmptyDiagnostic(providerId)
		);
	}

	let latestDiagnostic: ProviderDiagnostic | null = null;
	for (const supportedCapability of DIAGNOSTIC_CAPABILITIES) {
		const diagnostic = diagnostics.get(
			getDiagnosticKey(providerId, supportedCapability),
		);
		if (!diagnostic) {
			continue;
		}
		if (
			latestDiagnostic === null ||
			(diagnostic.updatedAt ?? 0) > (latestDiagnostic.updatedAt ?? 0)
		) {
			latestDiagnostic = diagnostic;
		}
	}

	return latestDiagnostic ?? getEmptyDiagnostic(providerId);
}

export function getProviderDiagnostics(): ProviderDiagnostic[] {
	return [getProviderDiagnostic("anthropic"), getProviderDiagnostic("openai")];
}

export function reportProviderIssue(
	providerId: ProviderId,
	issue: ProviderIssue,
): void {
	const capability = issue.capability ?? "chat";
	diagnostics.set(getDiagnosticKey(providerId, capability), {
		providerId,
		issue,
		updatedAt: Date.now(),
	});
}

export function clearProviderIssue(
	providerId: ProviderId,
	capability?: ProviderCapability,
): void {
	if (capability) {
		diagnostics.delete(getDiagnosticKey(providerId, capability));
		return;
	}

	for (const supportedCapability of DIAGNOSTIC_CAPABILITIES) {
		diagnostics.delete(getDiagnosticKey(providerId, supportedCapability));
	}
}
