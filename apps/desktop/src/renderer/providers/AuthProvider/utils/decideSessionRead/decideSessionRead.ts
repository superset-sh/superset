import { shouldBootFromSavedSession } from "../savedSession";

interface SessionReadInput {
	userId: string | null;
	error: { status?: number } | null | undefined;
	isSettled: boolean;
	isOwnWrite: boolean;
	hasToken: boolean;
	isSigningOut: boolean;
	lastUserId: string | null;
}

export type SessionReadDecision =
	| { type: "ignore" }
	| { type: "confirmed"; accountChanged: boolean }
	| { type: "keep-last-session"; status: "unconfirmed" | "ended" };

/**
 * A returning user never loses the app to a session read: only Log out, or a
 * machine with nothing saved, leaves the session empty.
 */
export function decideSessionRead({
	userId,
	error,
	isSettled,
	isOwnWrite,
	hasToken,
	isSigningOut,
	lastUserId,
}: SessionReadInput): SessionReadDecision {
	if (isOwnWrite || !isSettled) return { type: "ignore" };
	if (userId) {
		if (error) return { type: "ignore" };
		return {
			type: "confirmed",
			accountChanged: lastUserId !== null && lastUserId !== userId,
		};
	}
	if (!hasToken || isSigningOut || lastUserId === null) {
		return { type: "ignore" };
	}
	return {
		type: "keep-last-session",
		status: shouldBootFromSavedSession({
			hasUser: false,
			error,
			timedOut: false,
		})
			? "unconfirmed"
			: "ended",
	};
}
