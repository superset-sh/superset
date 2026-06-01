import type { Server } from "node:net";

// Interactive terminal traffic is sparse, small frames: a keystroke and its
// echo. By default Node leaves Nagle's algorithm on, which holds small,
// partial TCP segments waiting for the previous ACK — interacting badly with
// delayed-ACK and adding tens-to-hundreds of ms per keystroke across the
// relay's hops. (Bulk/back-to-back traffic is unaffected, so this only ever
// hurt interactive typing on remote terminals.) Disabling Nagle with
// TCP_NODELAY collapses sparse round-trips to the network floor.
//
// Both ends that connect to the relay — the client terminal WebSocket and the
// host tunnel WebSocket — terminate here, so setting noDelay on every accepted
// socket covers the relay's writes in both directions.
export function enableTcpNoDelay(server: Pick<Server, "on">): void {
	server.on("connection", (socket) => {
		socket.setNoDelay(true);
	});
}
