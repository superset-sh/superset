import { describe, expect, test } from "bun:test";
import { supportsRemoteUpdate } from "./capability";

describe("remote update capability", () => {
	test("supports a standalone Unix host with the supervisor installed", () => {
		expect(
			supportsRemoteUpdate({
				environment: {
					SUPERSET_INSTALL_ROOT: "/opt/superset",
					SUPERSET_AUTH_CONFIG_PATH: "/home/me/.superset/config.json",
					SUPERSET_HOST_LIFECYCLE_MODE: "daemon",
				},
				platform: "linux",
				pathExists: (path) =>
					path === "/opt/superset/bin/superset-host-supervisor",
			}),
		).toBe(true);
	});

	test("rejects Electron-managed hosts even if a supervisor path exists", () => {
		expect(
			supportsRemoteUpdate({
				environment: {
					HOST_PARENT_PID: "123",
					SUPERSET_AUTH_CONFIG_PATH: "/tmp/config.json",
					SUPERSET_HOST_SUPERVISOR_BIN: "/tmp/supervisor",
					SUPERSET_HOST_LIFECYCLE_MODE: "daemon",
				},
				platform: "darwin",
				pathExists: () => true,
			}),
		).toBe(false);
	});

	test("rejects missing supervisors, transient auth, and Windows installs", () => {
		expect(
			supportsRemoteUpdate({
				environment: {
					SUPERSET_AUTH_CONFIG_PATH: "/tmp/config.json",
					SUPERSET_HOST_LIFECYCLE_MODE: "daemon",
				},
				platform: "linux",
				pathExists: () => false,
			}),
		).toBe(false);
		expect(
			supportsRemoteUpdate({
				environment: {
					SUPERSET_HOST_SUPERVISOR_BIN: "/tmp/supervisor",
					SUPERSET_HOST_LIFECYCLE_MODE: "daemon",
				},
				platform: "linux",
				pathExists: () => true,
			}),
		).toBe(false);
		expect(
			supportsRemoteUpdate({
				environment: {
					SUPERSET_AUTH_CONFIG_PATH: "C:\\config.json",
					SUPERSET_HOST_SUPERVISOR_BIN: "C:\\supervisor.exe",
					SUPERSET_HOST_LIFECYCLE_MODE: "daemon",
				},
				platform: "win32",
				pathExists: () => true,
			}),
		).toBe(false);
	});

	test("rejects foreground standalone hosts", () => {
		expect(
			supportsRemoteUpdate({
				environment: {
					SUPERSET_AUTH_CONFIG_PATH: "/tmp/config.json",
					SUPERSET_HOST_LIFECYCLE_MODE: "foreground",
					SUPERSET_HOST_SUPERVISOR_BIN: "/tmp/supervisor",
				},
				platform: "linux",
				pathExists: () => true,
			}),
		).toBe(false);
	});
});
