import path from "node:path";
import { CONFIG_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import { SUPERSET_PROJECT_CONFIG_CLI } from "shared/project-configuration";
import { writeFileIfChanged } from "./agent-wrappers-common";
import { BIN_DIR, HOOKS_DIR } from "./paths";

const PROJECT_CONFIG_CLI_MARKER = "# Superset project-config cli v1";
const PROJECT_CONFIG_CLI_SCRIPT_NAME = "superset-project-config.js";

function quoteShellLiteral(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function getProjectConfigCliScriptPath(): string {
	return path.join(HOOKS_DIR, PROJECT_CONFIG_CLI_SCRIPT_NAME);
}

function getProjectConfigCliWrapperPath(): string {
	return path.join(BIN_DIR, SUPERSET_PROJECT_CONFIG_CLI);
}

export function getProjectConfigCliScriptContent(): string {
	return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const CONFIG_FILE_NAME = ${JSON.stringify(CONFIG_FILE_NAME)};
const PROJECT_SUPERSET_DIR_NAME = ${JSON.stringify(PROJECT_SUPERSET_DIR_NAME)};

function printUsage() {
  console.error("Usage:");
  console.error("  ${SUPERSET_PROJECT_CONFIG_CLI} show --project-root <path>");
  console.error("  ${SUPERSET_PROJECT_CONFIG_CLI} write --project-root <path> [--setup <command>]... [--teardown <command>]...");
  console.error("  ${SUPERSET_PROJECT_CONFIG_CLI} write --project-root <path> [--setup-json <json>] [--teardown-json <json>]");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseStringArrayFlag(value, flagName) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("Expected an array of strings");
    }
    return parsed;
  } catch (error) {
    fail(\`Invalid value for \${flagName}: \${error instanceof Error ? error.message : String(error)}\`);
  }
}

function parseOptions(argv) {
  const options = {
    projectRoot: null,
    setup: [],
    teardown: [],
    setupJson: null,
    teardownJson: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--project-root") {
      if (!next) {
        fail("Missing value for --project-root");
      }
      options.projectRoot = next;
      index += 1;
      continue;
    }

    if (arg === "--setup") {
      if (!next) {
        fail("Missing value for --setup");
      }
      options.setup.push(next);
      index += 1;
      continue;
    }

    if (arg === "--teardown") {
      if (!next) {
        fail("Missing value for --teardown");
      }
      options.teardown.push(next);
      index += 1;
      continue;
    }

    if (arg === "--setup-json") {
      if (!next) {
        fail("Missing value for --setup-json");
      }
      options.setupJson = parseStringArrayFlag(next, "--setup-json");
      index += 1;
      continue;
    }

    if (arg === "--teardown-json") {
      if (!next) {
        fail("Missing value for --teardown-json");
      }
      options.teardownJson = parseStringArrayFlag(next, "--teardown-json");
      index += 1;
      continue;
    }

    fail(\`Unknown argument: \${arg}\`);
  }

  return options;
}

function getConfigPath(projectRoot) {
  return path.join(projectRoot, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME);
}

function readExistingConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object");
    }
    return parsed;
  } catch (error) {
    fail(\`Failed to read existing config at \${configPath}: \${error instanceof Error ? error.message : String(error)}\`);
  }
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  const options = parseOptions(rest);
  if (!options.projectRoot) {
    fail("--project-root is required");
  }

  const projectRoot = path.resolve(options.projectRoot);
  if (!fs.existsSync(projectRoot)) {
    fail(\`Project root does not exist: \${projectRoot}\`);
  }

  const configPath = getConfigPath(projectRoot);

  if (command === "show") {
    const exists = fs.existsSync(configPath);
    const config = exists ? readExistingConfig(configPath) : null;
    console.log(JSON.stringify({ projectRoot, path: configPath, exists, config }, null, 2));
    return;
  }

  if (command === "write") {
    const existing = readExistingConfig(configPath);
    const setup =
      options.setupJson !== null
        ? options.setupJson
        : options.setup.length > 0
          ? options.setup
          : Array.isArray(existing.setup)
            ? existing.setup
            : [];
    const teardown =
      options.teardownJson !== null
        ? options.teardownJson
        : options.teardown.length > 0
          ? options.teardown
          : Array.isArray(existing.teardown)
            ? existing.teardown
            : [];

    fs.mkdirSync(path.dirname(configPath), { recursive: true });

    const nextConfig = {
      ...existing,
      setup,
      teardown,
    };

    fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2) + "\\n", "utf-8");
    console.log(JSON.stringify({ projectRoot, path: configPath, config: nextConfig }, null, 2));
    return;
  }

  fail(\`Unknown command: \${command}\`);
}

main();
`;
}

export function getProjectConfigCliWrapperContent(): string {
	return `#!/bin/bash
${PROJECT_CONFIG_CLI_MARKER}
set -euo pipefail

export ELECTRON_RUN_AS_NODE=1
exec ${quoteShellLiteral(process.execPath)} ${quoteShellLiteral(getProjectConfigCliScriptPath())} "$@"
`;
}

export function createProjectConfigCli(): void {
	const scriptChanged = writeFileIfChanged(
		getProjectConfigCliScriptPath(),
		getProjectConfigCliScriptContent(),
		0o755,
	);
	const wrapperChanged = writeFileIfChanged(
		getProjectConfigCliWrapperPath(),
		getProjectConfigCliWrapperContent(),
		0o755,
	);

	console.log(
		`[agent-setup] ${scriptChanged || wrapperChanged ? "Updated" : "Verified"} ${SUPERSET_PROJECT_CONFIG_CLI} CLI`,
	);
}
