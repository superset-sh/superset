/**
 * The single source of ACP typing for both sides of the wire (Decision D7 in
 * packages/host-service/docs/acp-sessions.md): host-service and every client import ACP
 * types ONLY through this file — the ENTIRE generated surface, never a
 * hand-picked subset.
 *
 * Type-only on purpose. Runtime connection machinery (client(), ndJsonStream)
 * is imported from the sdk directly by host-service; the sdk's generated zod
 * schemas are not exposed by its package exports map (Decision D14-b), so
 * runtime validation of our own API lives in ./api.ts.
 */
export type * from "@agentclientprotocol/sdk";
