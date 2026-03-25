import { type SshHostConfig, settings } from "@superset/local-db";
import { localDb } from "../local-db";

function getSettingsRow() {
	let row = localDb.select().from(settings).get();
	if (!row) {
		row = localDb.insert(settings).values({ id: 1 }).returning().get();
	}
	return row;
}

function persistSshHosts(sshHosts: SshHostConfig[]) {
	localDb
		.insert(settings)
		.values({
			id: 1,
			sshHosts,
		})
		.onConflictDoUpdate({
			target: settings.id,
			set: { sshHosts },
		})
		.run();
}

function sortSshHosts(sshHosts: SshHostConfig[]): SshHostConfig[] {
	return [...sshHosts].sort((left, right) =>
		left.name.localeCompare(right.name),
	);
}

export function listSshHosts(): SshHostConfig[] {
	return sortSshHosts(getSettingsRow().sshHosts ?? []);
}

export function getSshHost(hostId: string): SshHostConfig | null {
	return listSshHosts().find((host) => host.id === hostId) ?? null;
}

export function upsertSshHost(host: SshHostConfig): SshHostConfig[] {
	const nextHosts = listSshHosts().filter(
		(candidate) => candidate.id !== host.id,
	);
	nextHosts.push(host);
	const sortedHosts = sortSshHosts(nextHosts);
	persistSshHosts(sortedHosts);
	return sortedHosts;
}

export function removeSshHost(hostId: string): SshHostConfig[] {
	const nextHosts = listSshHosts().filter((host) => host.id !== hostId);
	persistSshHosts(nextHosts);
	return nextHosts;
}
