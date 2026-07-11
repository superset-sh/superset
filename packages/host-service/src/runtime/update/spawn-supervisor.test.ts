import { describe, expect, mock, test } from "bun:test";
import type { SpawnOptions, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { spawnUpdateSupervisor } from "./spawn-supervisor";

describe("spawnUpdateSupervisor", () => {
	test("detaches with the versioned update protocol and persisted auth path", () => {
		const unref = mock(() => undefined);
		const child = Object.assign(new EventEmitter(), { pid: 321, unref });
		let capturedOptions: SpawnOptions | undefined;
		const spawnMock = mock(
			(_command: string, _args: readonly string[], options: SpawnOptions) => {
				capturedOptions = options;
				return child;
			},
		);
		const spawnProcess = spawnMock as unknown as typeof spawn;

		const result = spawnUpdateSupervisor({
			organizationId: "00000000-0000-4000-8000-000000000123",
			oldPid: 123,
			targetVersion: "1.15.0",
			execPath: "/opt/superset/lib/node",
			environment: {
				HOME: "/home/me",
				PATH: "/usr/bin",
				SUPERSET_AUTH_CONFIG_PATH: "/home/me/.superset/config.json",
				SUPERSET_HOME_DIR: "/home/me/.superset",
			},
			spawnProcess,
		});

		expect(result).toEqual({
			supervisorPid: 321,
			supervisorBinary: "/opt/superset/bin/superset-host-supervisor",
		});
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(capturedOptions?.detached).toBe(true);
		expect(capturedOptions?.stdio).toBe("ignore");
		expect(capturedOptions?.env).toMatchObject({
			SUPERSET_AUTH_CONFIG_PATH: "/home/me/.superset/config.json",
			SUPERSET_HOME_DIR: "/home/me/.superset",
			SUPERSET_INSTALL_ROOT: "/opt/superset",
			SUPERSET_UPDATE_OLD_PID: "123",
			SUPERSET_UPDATE_ORG_ID: "00000000-0000-4000-8000-000000000123",
			SUPERSET_UPDATE_TARGET_VERSION: "1.15.0",
		});
		expect(unref).toHaveBeenCalledTimes(1);
	});

	test("handles an asynchronous spawn error without throwing it", () => {
		const child = Object.assign(new EventEmitter(), {
			pid: 321,
			unref: mock(() => undefined),
		});
		const spawnProcess = mock(() => child) as unknown as typeof spawn;
		const onSpawnError = mock((_error: Error) => undefined);

		spawnUpdateSupervisor({
			organizationId: "00000000-0000-4000-8000-000000000123",
			oldPid: 123,
			targetVersion: "1.15.0",
			execPath: "/opt/superset/lib/node",
			environment: {
				HOME: "/home/me",
				PATH: "/usr/bin",
				SUPERSET_AUTH_CONFIG_PATH: "/home/me/.superset/config.json",
			},
			spawnProcess,
			onSpawnError,
		});

		expect(() => child.emit("error", new Error("EACCES"))).not.toThrow();
		expect(onSpawnError).toHaveBeenCalledTimes(1);
		expect(onSpawnError.mock.calls[0]?.[0]?.message).toBe("EACCES");
	});

	test("attaches the error listener before rejecting a missing child pid", () => {
		const child = Object.assign(new EventEmitter(), {
			pid: undefined,
			unref: mock(() => undefined),
		});
		const spawnProcess = mock(() => child) as unknown as typeof spawn;
		const onSpawnError = mock((_error: Error) => undefined);

		expect(() =>
			spawnUpdateSupervisor({
				organizationId: "00000000-0000-4000-8000-000000000123",
				oldPid: 123,
				targetVersion: "1.15.0",
				execPath: "/opt/superset/lib/node",
				environment: {
					HOME: "/home/me",
					PATH: "/usr/bin",
					SUPERSET_AUTH_CONFIG_PATH: "/home/me/.superset/config.json",
				},
				spawnProcess,
				onSpawnError,
			}),
		).toThrow("Failed to spawn update supervisor");
		expect(() => child.emit("error", new Error("ENOENT"))).not.toThrow();
		expect(onSpawnError.mock.calls[0]?.[0]?.message).toBe("ENOENT");
	});
});
