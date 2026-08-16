import type { HostDb } from "../db";
import {
	type AgentCapabilityView,
	CapabilityRefreshService,
	readPersistedCapabilitySnapshots,
} from "./capability-refresh-service";
import { pruneExpiredCapabilitySnapshots } from "./capability-snapshot-repository";

export interface CapabilityStartupResult {
	snapshots: AgentCapabilityView[];
	capabilityRefresh: CapabilityRefreshService;
}

export function initializeHostCapabilitySnapshots(
	db: HostDb,
	now = Date.now(),
): CapabilityStartupResult {
	pruneExpiredCapabilitySnapshots(db, { now });
	return {
		snapshots: readPersistedCapabilitySnapshots(db, now),
		capabilityRefresh: new CapabilityRefreshService(db),
	};
}
