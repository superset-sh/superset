import type { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type UpdateClient = Pick<
	ReturnType<typeof getHostServiceClientByUrl>,
	"health" | "system"
>;

/** A successor may predate the update-status API; its live version proves completion. */
export async function readHostUpdateSnapshot(
	client: UpdateClient,
	targetVersion: string,
) {
	const health = await client.health.check.query(undefined, {
		signal: AbortSignal.timeout(10_000),
	});
	const status =
		health.version === targetVersion
			? null
			: await client.system.updateStatus.query(undefined, {
					signal: AbortSignal.timeout(10_000),
				});
	return { health, status };
}
