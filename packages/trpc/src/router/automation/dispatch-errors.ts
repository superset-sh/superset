import { RelayDispatchError } from "./relay-client";

const PROJECT_NOT_SETUP_MESSAGE =
	"Automation should not require a project workspace. Restart or update Superset on the selected host, then try again.";

const CAPABILITY_ARTIFACT_UNAVAILABLE_MESSAGE =
	"Capability package artifact is not available on the selected host. Update Superset and retry, or re-import the Tools & Skills package.";

function extractRelayErrorMessage(body: string): string | null {
	try {
		const parsed = JSON.parse(body) as {
			error?: { json?: { message?: unknown } };
		};
		const message = parsed.error?.json?.message;
		return typeof message === "string" && message.trim()
			? message.trim()
			: null;
	} catch {
		return null;
	}
}

function isCapabilityArtifactLocalPathFailure(message: string): boolean {
	return (
		(message.includes("capability-artifacts") &&
			(message.includes("ENOENT") || message.includes("ENOTDIR"))) ||
		message.includes("Failed to download capability archive: HTTP 404")
	);
}

export function describeDispatchError(err: unknown, context: string): string {
	if (err instanceof RelayDispatchError) {
		const message = extractRelayErrorMessage(err.body) ?? err.message;
		if (isCapabilityArtifactLocalPathFailure(message)) {
			return `${context}: ${CAPABILITY_ARTIFACT_UNAVAILABLE_MESSAGE}`;
		}
		if (
			err.status === 412 &&
			message.includes("Project is not set up on this host")
		) {
			return `${context}: ${PROJECT_NOT_SETUP_MESSAGE}`;
		}
		return `${context}: ${message}`;
	}
	if (err instanceof Error) {
		if (isCapabilityArtifactLocalPathFailure(err.message)) {
			return `${context}: ${CAPABILITY_ARTIFACT_UNAVAILABLE_MESSAGE}`;
		}
		return `${context}: ${err.message}`;
	}
	return `${context}: unknown error`;
}
