/**
 * Get the physical memory footprint for the given PIDs.
 *
 * On macOS this calls `proc_pid_rusage()` and returns `ri_phys_footprint`
 * (the same value Activity Monitor shows as "Memory").
 *
 * On non-macOS platforms an empty object is returned.
 *
 * @returns A map from PID to footprint in bytes. Missing/inaccessible
 *          PIDs are silently omitted.
 */
export function getPhysFootprints(pids: number[]): Record<number, number>;
