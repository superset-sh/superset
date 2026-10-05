import { cacheLife } from "next/cache";
import {
	fetchParticipant,
	isRateLimited,
	type ParticipantProfile,
} from "@/app/[lang]/utils/fetchLeaderboard";

export type ProfileLookup =
	| { state: "found"; profile: ParticipantProfile }
	| { state: "missing" }
	| { state: "rate-limited" }
	| { state: "unavailable" };

async function loadCachedProfile(handle: string): Promise<ProfileLookup> {
	"use cache";
	try {
		const profile = await fetchParticipant(handle, { period: "all" });
		cacheLife({ revalidate: 300 });
		return profile ? { state: "found", profile } : { state: "missing" };
	} catch (error) {
		if (!isRateLimited(error)) throw error;
		cacheLife("seconds");
		return { state: "rate-limited" };
	}
}

export async function loadProfile(handle: string): Promise<ProfileLookup> {
	try {
		return await loadCachedProfile(handle);
	} catch (error) {
		console.error("[marketing/profile] Failed to load profile", error);
		return { state: "unavailable" };
	}
}
