import { createServer } from "node:net";
import type { PublishedPort } from "./docker-args.ts";

/** True when 127.0.0.1:<port> is currently bindable on the host. */
export function isHostPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.unref();
		server.once("error", () => resolve(false));
		server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
			server.close(() => resolve(true));
		});
	});
}

export interface PortSelection {
	published: PublishedPort[];
	/** Declared ports whose host port was taken — not published. */
	skipped: number[];
}

/**
 * Same-number publishing only for now: a declared container port is bound
 * to the identical host loopback port so existing "open localhost:<port>"
 * UX works unchanged; conflicting ports are skipped with a warning.
 * Deterministic remapping + surfacing the mapping in the ports UI is the
 * M3 ports milestone.
 */
export async function selectPublishablePorts(
	declaredPorts: number[],
): Promise<PortSelection> {
	const published: PublishedPort[] = [];
	const skipped: number[] = [];
	for (const port of declaredPorts) {
		if (await isHostPortFree(port)) {
			published.push({ containerPort: port, hostPort: port });
		} else {
			skipped.push(port);
		}
	}
	return { published, skipped };
}
