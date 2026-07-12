/**
 * Queries and commands travel over tRPC (`sessions.*`); the only raw HTTP
 * surface this package owns is the synchronization WebSocket. Protocol
 * versioning lives in the hello/hello_ack handshake, never in route names.
 */
export const SESSIONS_SYNC_PATH = "/sessions/sync";
export const SESSIONS_SYNC_WEBSOCKET_PROTOCOL = "superset.sessions.sync";
