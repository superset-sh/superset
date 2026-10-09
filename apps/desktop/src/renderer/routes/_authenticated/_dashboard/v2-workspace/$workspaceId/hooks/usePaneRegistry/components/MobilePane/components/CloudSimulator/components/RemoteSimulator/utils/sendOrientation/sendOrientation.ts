const ORIENTATION_MESSAGE_TAG = 7;
const CLOSE_AFTER_MS = 200;

/** serve-sim takes an explicit orientation as one tagged frame on the
 * simulator's input socket; it has no HTTP route for it. */
export function sendOrientation({
	baseUrl,
	token,
	deviceId,
	orientation,
}: {
	baseUrl: string;
	token: string;
	deviceId: string;
	orientation: "portrait" | "landscape_left";
}): void {
	const url = new URL(`${baseUrl}/helper/${encodeURIComponent(deviceId)}/ws`);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	const socket = new WebSocket(url, [`serve-sim.token.${token}`]);
	socket.binaryType = "arraybuffer";
	socket.addEventListener("open", () => {
		const payload = new TextEncoder().encode(JSON.stringify({ orientation }));
		const frame = new Uint8Array(1 + payload.length);
		frame[0] = ORIENTATION_MESSAGE_TAG;
		frame.set(payload, 1);
		socket.send(frame);
		setTimeout(() => socket.close(), CLOSE_AFTER_MS);
	});
}
