import type {
	ParticipantProfile,
	StandingRow,
} from "@/app/[lang]/utils/fetchLeaderboard";
import type { ViewerProfile } from "@/app/[lang]/utils/fetchViewer";
import type { Fighter } from "../simulateFight";

export function fromStandingRow(row: StandingRow): Fighter {
	return {
		handle: row.handle,
		name: row.name ?? `@${row.handle}`,
		tier: row.tier,
		axes: row.axes,
	};
}

export function fromParticipant(profile: ParticipantProfile): Fighter {
	return {
		handle: profile.handle,
		name: profile.name ?? `@${profile.handle}`,
		tier: profile.factory.tier,
		axes: profile.axes,
	};
}

export function fromViewer(viewer: ViewerProfile): Fighter {
	return {
		handle: viewer.handle,
		name: viewer.name ?? `@${viewer.handle}`,
		tier: viewer.tier,
		axes: viewer.axes,
	};
}
