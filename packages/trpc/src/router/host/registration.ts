import type { HostInstallSource } from "@superset/shared/host-version";
import { TRPCError } from "@trpc/server";

export interface HostRegistration {
	organizationId: string;
	machineId: string;
	name: string;
	version?: string;
	platform?: string;
	installSource?: HostInstallSource;
}

/** Keep authorization next to the write, including the insert-conflict path. */
export async function registerHost<Row>(
	input: HostRegistration,
	store: {
		insert(): Promise<Row | undefined>;
		grantOwner(): Promise<void>;
		isOwner(): Promise<boolean>;
		isOrgAdmin(): Promise<boolean>;
		update(
			metadata: Pick<
				HostRegistration,
				"version" | "platform" | "installSource"
			>,
		): Promise<Row | undefined>;
		read(): Promise<Row | undefined>;
	},
): Promise<{ host: Row | undefined; inserted: boolean }> {
	const inserted = await store.insert();
	if (inserted) {
		await store.grantOwner();
		return { host: inserted, inserted: true };
	}
	const metadata = {
		...(input.version !== undefined ? { version: input.version } : {}),
		...(input.platform !== undefined ? { platform: input.platform } : {}),
		...(input.installSource !== undefined
			? { installSource: input.installSource }
			: {}),
	};
	if (Object.keys(metadata).length === 0) {
		return { host: await store.read(), inserted: false };
	}
	if (!(await store.isOwner())) {
		// An org admin re-registering a machine whose owner has left takes it
		// over; anyone else could be spoofing a known machine id.
		if (!(await store.isOrgAdmin())) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message:
					"Only a host owner or an organization admin can report its build",
			});
		}
		await store.grantOwner();
	}
	return { host: await store.update(metadata), inserted: false };
}
