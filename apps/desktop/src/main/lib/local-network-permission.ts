import dgram from "node:dgram";

const MDNS_MULTICAST_ADDRESS = "224.0.0.251";
const MDNS_PORT = 5353;

/**
 * Triggers the macOS local network permission prompt by attempting
 * to send a multicast DNS query. This is a no-op on non-macOS platforms.
 *
 * On macOS 11+, this will cause the system to show the local network
 * permission dialog if it hasn't been granted yet.
 */
export function requestLocalNetworkAccess(): void {
	if (process.platform !== "darwin") {
		return;
	}

	const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

	socket.on("error", (err) => {
		console.log(
			"[local-network] Socket error (expected if permission denied):",
			err.message,
		);
		socket.close();
	});

	socket.bind(() => {
		try {
			// Attempt to send to the mDNS multicast address
			// This triggers the local network permission prompt on macOS
			const message = Buffer.from([0]);
			socket.send(
				message,
				0,
				message.length,
				MDNS_PORT,
				MDNS_MULTICAST_ADDRESS,
				(err) => {
					if (err) {
						console.log(
							"[local-network] Send error (expected if permission denied):",
							err.message,
						);
					} else {
						console.log("[local-network] Local network access requested");
					}
					socket.close();
				},
			);
		} catch (err) {
			console.log("[local-network] Failed to send multicast:", err);
			socket.close();
		}
	});
}
