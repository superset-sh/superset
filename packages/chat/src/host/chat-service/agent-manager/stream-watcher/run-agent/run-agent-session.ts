import {
	sessionAbortControllers,
	sessionContext,
	sessionRunIds,
} from "../../session-state";

export function resetSessionAbortController(
	sessionId: string,
): AbortController {
	const existingController = sessionAbortControllers.get(sessionId);
	if (existingController) {
		existingController.abort();
	}

	const abortController = new AbortController();
	sessionAbortControllers.set(sessionId, abortController);
	return abortController;
}

export function releaseSessionAbortController(
	sessionId: string,
	abortController: AbortController,
): void {
	if (sessionAbortControllers.get(sessionId) === abortController) {
		sessionAbortControllers.delete(sessionId);
	}
}

export function clearSessionStateForFailure(sessionId: string): void {
	sessionRunIds.delete(sessionId);
	sessionContext.delete(sessionId);
}
