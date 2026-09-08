import { unstable_noStore } from "next/cache";
import {
	fetchParticipant,
	isRateLimited,
	type ParticipantProfile,
} from "@/app/[lang]/utils/fetchLeaderboard";

export type ProfileLookup =
	| { state: "found"; profile: ParticipantProfile }
	| { state: "missing" }
	| { state: "rate-limited" };

/**
 * Shared by the page and its metadata. Only a refused read becomes a state
 * of its own; any other failure still throws so ISR keeps the stale page.
 */
export async function loadProfile(handle: string): Promise<ProfileLookup> {
	try {
		const profile = await fetchParticipant(handle, { period: "all" });
		return profile ? { state: "found", profile } : { state: "missing" };
	} catch (error) {
		if (isRateLimited(error)) {
			// A refusal describes this moment, not this profile. The retry page
			// renders as an ordinary 200, so without opting out here the route's
			// revalidate window would serve it for every visitor to that handle
			// until it expired.
			unstable_noStore();
			return { state: "rate-limited" };
		}
		throw error;
	}
}
