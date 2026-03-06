import type { MutableRefObject } from "react";

export type AttachAttemptRef = MutableRefObject<number>;

export function beginAttachAttempt(attachAttemptRef: AttachAttemptRef): number {
	return ++attachAttemptRef.current;
}

export function isCurrentAttachAttempt(
	attachAttemptRef: AttachAttemptRef,
	attachAttempt: number,
): boolean {
	return attachAttemptRef.current === attachAttempt;
}
