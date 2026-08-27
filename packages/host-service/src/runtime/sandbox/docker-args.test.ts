import { describe, expect, test } from "bun:test";
import {
	buildContainerCreateArgs,
	buildExecArgs,
	DEFAULT_SANDBOX_IMAGE,
	parseConfigMount,
	resolveSandboxSettings,
} from "./docker-args.ts";
import { buildGitBootstrapCommands } from "./git-bootstrap.ts";

describe("buildContainerCreateArgs", () => {
	test("composes the full create argv", () => {
		const args = buildContainerCreateArgs({
			name: "superset-ws-abc",
			workspaceId: "abc",
			configHash: "deadbeef",
			ownerHome: "/home/me/.superset",
			image: "img:1",
			runtime: "runsc",
			network: "none",
			resources: { cpus: 2, memoryMb: 4096, pidsLimit: 1024 },
			mounts: [
				{ source: "/wt", target: "/wt" },
				{ source: "/mask", target: "/wt/.git", readOnly: true },
			],
			publishedPorts: [{ containerPort: 3000, hostPort: 3000 }],
		});
		expect(args).toEqual([
			"create",
			"--name",
			"superset-ws-abc",
			"--hostname",
			"superset-ws-abc",
			"--label",
			"com.superset.managed=true",
			"--label",
			"com.superset.workspace-id=abc",
			"--label",
			"com.superset.config-hash=deadbeef",
			"--label",
			"com.superset.home=/home/me/.superset",
			"--restart",
			"unless-stopped",
			"--init",
			"--runtime",
			"runsc",
			"--network",
			"none",
			"--cpus",
			"2",
			"--memory",
			"4096m",
			"--pids-limit",
			"1024",
			"--add-host",
			"host.docker.internal:host-gateway",
			"-p",
			"127.0.0.1:3000:3000",
			"--mount",
			"type=bind,source=/wt,target=/wt",
			"--mount",
			"type=bind,source=/mask,target=/wt/.git,readonly",
			"img:1",
			"sleep",
			"infinity",
		]);
	});

	test("omits runtime/network/cpu/memory flags when unset", () => {
		const args = buildContainerCreateArgs({
			name: "n",
			workspaceId: "w",
			configHash: "h",
			ownerHome: "/home/me/.superset",
			image: "img",
			network: "bridge",
			resources: { pidsLimit: 2048 },
			mounts: [],
			publishedPorts: [],
		});
		expect(args).not.toContain("-p");
		expect(args).not.toContain("--runtime");
		expect(args).not.toContain("--network");
		expect(args).not.toContain("--cpus");
		expect(args).not.toContain("--memory");
		expect(args).toContain("--pids-limit");
	});
});

describe("buildExecArgs", () => {
	test("threads cwd, env, and command through docker exec -it", () => {
		expect(
			buildExecArgs({
				containerName: "superset-ws-abc",
				cwd: "/wt/sub",
				env: { A: "1", B: "two words" },
				command: ["/bin/bash", "--rcfile", "/opt/superset/bash/rcfile"],
			}),
		).toEqual([
			"exec",
			"-it",
			"-w",
			"/wt/sub",
			"-e",
			"A=1",
			"-e",
			"B=two words",
			"superset-ws-abc",
			"/bin/bash",
			"--rcfile",
			"/opt/superset/bash/rcfile",
		]);
	});
});

describe("resolveSandboxSettings", () => {
	test("applies defaults to an empty config", () => {
		expect(resolveSandboxSettings({})).toEqual({
			image: DEFAULT_SANDBOX_IMAGE,
			network: "bridge",
			ports: [],
			resources: { pidsLimit: 2048 },
			extraMounts: [],
			envPassthrough: [],
			mountAgentConfig: false,
		});
	});

	test("parses ro mounts", () => {
		expect(parseConfigMount("/etc/certs:ro")).toEqual({
			source: "/etc/certs",
			target: "/etc/certs",
			readOnly: true,
		});
		expect(parseConfigMount("/opt/cache")).toEqual({
			source: "/opt/cache",
			target: "/opt/cache",
		});
	});
});

describe("buildGitBootstrapCommands", () => {
	test("produces the isolated-git-dir bootstrap sequence", () => {
		const commands = buildGitBootstrapCommands({
			workspaceId: "abc",
			repoPath: "/repo",
			branch: "feat/x",
			worktreePath: "/wt",
			headSha: "cafe123",
			gitDir: "/sb/git",
			cloneDepth: 25,
		});
		expect(commands.map((c) => c.argv)).toEqual([
			[
				"clone",
				"--bare",
				"--single-branch",
				"--branch",
				"feat/x",
				"--depth",
				"25",
				"file:///repo",
				"/sb/git",
			],
			["--git-dir", "/sb/git", "config", "core.bare", "false"],
			["--git-dir", "/sb/git", "config", "core.worktree", "/wt"],
			["--git-dir", "/sb/git", "config", "core.logAllRefUpdates", "true"],
			["--git-dir", "/sb/git", "update-ref", "refs/heads/feat/x", "cafe123"],
			["--git-dir", "/sb/git", "symbolic-ref", "HEAD", "refs/heads/feat/x"],
			["read-tree", "HEAD"],
		]);
		const readTree = commands.at(-1);
		expect(readTree?.env).toEqual({ GIT_DIR: "/sb/git", GIT_WORK_TREE: "/wt" });
	});
});
