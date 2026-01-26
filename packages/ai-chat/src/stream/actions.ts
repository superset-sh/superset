/**
 * Stream Actions
 *
 * Simple async functions for writing to the durable stream.
 * Follows the Electric SQL pattern of plain functions over complex hooks.
 */

export interface SessionUser {
	userId: string;
	name: string;
}

/**
 * Create a new stream (PUT request)
 * Returns true if created, false if already exists
 */
export async function createStream(
	baseUrl: string,
	sessionId: string,
): Promise<boolean> {
	const response = await fetch(`${baseUrl}/streams/${sessionId}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
	});

	// 201 = created, 200 = already exists
	return response.status === 201;
}

/**
 * Helper to POST events to the stream with correct content-type
 */
async function appendToStream(url: string, events: unknown[]): Promise<void> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(events),
	});

	if (!response.ok) {
		throw new Error(`Failed to append to stream: ${response.status}`);
	}
}

export interface SessionActions {
	/** Announce presence when joining */
	join: () => Promise<void>;
	/** Remove presence when leaving */
	leave: () => Promise<void>;
	/** Update draft content (empty content = delete draft) */
	updateDraft: (content: string) => Promise<void>;
}

/**
 * Creates action functions for a chat session
 *
 * @example
 * ```ts
 * const actions = createSessionActions({
 *   baseUrl: "http://localhost:8080",
 *   sessionId: "abc123",
 *   user: { userId: "user-1", name: "Alice" }
 * });
 *
 * await actions.join();
 * await actions.updateDraft("Hello...");
 * await actions.leave();
 * ```
 */
export function createSessionActions({
	baseUrl,
	sessionId,
	user,
}: {
	baseUrl: string;
	sessionId: string;
	user: SessionUser;
}): SessionActions {
	const streamUrl = `${baseUrl}/streams/${sessionId}`;

	return {
		join: async () => {
			await appendToStream(streamUrl, [
				{
					type: "presence",
					key: user.userId,
					value: {
						userId: user.userId,
						userName: user.name,
						joinedAt: new Date().toISOString(),
					},
					headers: { operation: "upsert" },
				},
			]);
		},

		leave: async () => {
			// Delete presence and draft on leave
			await appendToStream(streamUrl, [
				{
					type: "presence",
					key: user.userId,
					headers: { operation: "delete" },
				},
				{
					type: "draft",
					key: user.userId,
					headers: { operation: "delete" },
				},
			]);
		},

		updateDraft: async (content: string) => {
			await appendToStream(streamUrl, [
				{
					type: "draft",
					key: user.userId,
					value: {
						userId: user.userId,
						userName: user.name,
						content,
						updatedAt: new Date().toISOString(),
					},
					headers: { operation: content ? "upsert" : "delete" },
				},
			]);
		},
	};
}
