/**
 * Minimum host-service version a v2 workspace UI can work with against a
 * **remote** host whose binary we don't control (gates renderer mounting
 * via `useRemoteHostStatus`, and mobile's `useHostCompatibility`). For the
 * local host-service we bundle, the desktop coordinator pins to the bundled
 * version exactly (read from `@superset/host-service/package.json`) — this
 * floor does not apply.
 *
 * The floor lives on the unified product version line (desktop ==
 * host-service == cli at every release, see `scripts/release/README.md`).
 * It originally tracked host-service's own pre-release `0.x` line
 * (0.2.0 → 0.8.0) and was never migrated when host-service joined the
 * unified line, so for the whole 1.x series `>=0.8.0` accepted every host
 * and the gate could not reject anything (#6525). A test next to this file
 * pins the floor to the same major line as the shipped host-service so
 * that drift stays loud.
 *
 * When a release adds a host-service procedure that clients call
 * unconditionally, raise this to that release, or the mismatch renders as
 * silent empty states instead of an explicit "host too old" screen.
 *
 * 1.22.0 — `terminal.list` added; every terminal surface (desktop
 * renderer, CLI, SDK, MCP, mobile) calls it unconditionally. Older hosts
 * answer NOT_FOUND, which rendered as a blank terminal pane (#6525).
 */
export const MIN_HOST_SERVICE_VERSION = "1.22.0";
