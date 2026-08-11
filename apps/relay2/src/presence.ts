import { createApiClient } from "./api-client";

const RETRY_BASE_MS = 500;
const MAX_ATTEMPTS = 3;

// Version-gated: a late offline write from a dying socket must not clobber a
// newer online write. The caller owns the counter (an in-memory sequence in
// the Durable Object, incremented synchronously so two writes can never share
// a version).
export async function writePresence({
	version,
	isSuperseded,
	apiUrl,
	hostId,
	token,
	isOnline,
}: {
	version: number;
	isSuperseded: (version: number) => boolean;
	apiUrl: string;
	hostId: string;
	token: string;
	isOnline: boolean;
}): Promise<void> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		if (isSuperseded(version)) return;
		try {
			await createApiClient(token, apiUrl).host.setOnline.mutate({
				hostId,
				isOnline,
			});
			return;
		} catch (err) {
			if (attempt === MAX_ATTEMPTS - 1) {
				console.error(
					`[relay2] setOnline(${isOnline}) failed for ${hostId}`,
					err,
				);
				return;
			}
			await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
		}
	}
}
