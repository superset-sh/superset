#!/usr/bin/env bun

// The single entry point for releases (`bun run release`). Routes to the desktop
// or CLI flow so the whole bundle (desktop + host-service + cli) can't drift —
// both flows and the CI guard share ./lib.ts. See
// plans/20260709-unified-version-bumping.md.
//
// Agent-friendly: every action is reachable non-interactively via subcommands +
// flags. The interactive menu only runs on a TTY; otherwise usage is printed.

import { runCheck } from "./check-versions.ts";
import { runCli } from "./cli.ts";
import { runDesktop } from "./desktop.ts";

function usage(): void {
	console.log(`Usage: bun run release <command> [flags]

Commands:
  desktop [version] [commit] [--publish] [--merge] [--daemon] [--republish]
      New version; desktop + host-service + cli move together, publishes desktop.
  cli [suffix] [--daemon] [--no-tag]
      Interim prerelease (<desktop>-N) for cli + host-service.
  check
      Verify versions are unified (exit 1 on drift).

Run with no command for an interactive menu (TTY only).`);
}

const [sub, ...rest] = process.argv.slice(2);

switch (sub) {
	case "desktop":
		await runDesktop(rest);
		break;
	case "cli":
		await runCli(rest);
		break;
	case "check":
		process.exit((await runCheck()) ? 0 : 1);
		break;
	case "-h":
	case "--help":
	case "help":
		usage();
		break;
	case undefined: {
		if (!process.stdin.isTTY) {
			usage();
			process.exit(1);
		}
		console.log("What do you want to release?");
		console.log(
			"  1) Desktop     — new version; desktop + host-service + cli move together",
		);
		console.log(
			"  2) CLI hotfix  — interim prerelease (<desktop>-N) for cli + host-service",
		);
		const choice = prompt("Enter choice [1-2]:");
		if (choice === "1") await runDesktop([]);
		else if (choice === "2") await runCli([]);
		else {
			console.error("Invalid choice.");
			process.exit(1);
		}
		break;
	}
	default:
		console.error(`Unknown command: ${sub}\n`);
		usage();
		process.exit(1);
}
