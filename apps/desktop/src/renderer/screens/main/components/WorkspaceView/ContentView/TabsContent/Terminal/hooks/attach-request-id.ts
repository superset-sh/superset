let nextAttachRequestSequence = 0;

export function createAttachRequestId(paneId: string): string {
	nextAttachRequestSequence += 1;
	return `${paneId}:${nextAttachRequestSequence}`;
}
