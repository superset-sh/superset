/**
 * Generator for the container superset-home: a host-side directory
 * bind-mounted read-only at CONTAINER_SUPERSET_DIR in every sandbox
 * container, with SUPERSET_HOME_DIR pointing at it in-container.
 *
 * Contents mirror the host's desktop-generated ~/.superset wrappers where
 * container-relevant: a bash rcfile that emits the OSC 133;A readiness
 * marker (same contract terminal.ts scans for) and the notify.sh agent
 * hook (copied from the host's rendered script — it resolves
 * SUPERSET_HOME_DIR and SUPERSET_HOST_AGENT_HOOK_URL at runtime, so the
 * exact same script works in-container).
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	CONTAINER_SUPERSET_DIR,
	getSandboxHomeDir,
	getSupersetHomeDir,
} from "./paths.ts";

const CONTAINER_BIN_DIR = `${CONTAINER_SUPERSET_DIR}/bin`;

/**
 * Bash rcfile for sandbox shells. Mirrors the desktop bash wrapper's
 * readiness contract: emits OSC 777 (legacy) + OSC 133;A (current scanner)
 * on every prompt. shellLaunchExpectsReadyMarker-equivalent behavior is
 * guaranteed by generation — DockerRuntime always reports marker support.
 */
function buildContainerBashRcfile(): string {
	return `# Superset sandbox bash rcfile (generated — do not edit)

[ -f /etc/profile ] && source /etc/profile
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"

case ":$PATH:" in
  *":${CONTAINER_BIN_DIR}:"*) ;;
  *) export PATH="${CONTAINER_BIN_DIR}:$PATH" ;;
esac

export PS1=$'\\[\\e[1;38;2;52;211;153m\\]❯\\[\\e[0m\\] '

__superset_prompt_mark() {
  printf "\\033]777;superset-shell-ready\\007\\033]133;A\\007"
}
if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
  PROMPT_COMMAND=("\${PROMPT_COMMAND[@]}" "__superset_prompt_mark")
else
  _superset_orig_prompt_cmd="\${PROMPT_COMMAND}"
  if [[ -n "\${_superset_orig_prompt_cmd}" ]]; then
    PROMPT_COMMAND="\${_superset_orig_prompt_cmd};__superset_prompt_mark"
  else
    PROMPT_COMMAND="__superset_prompt_mark"
  fi
fi
`;
}

/**
 * Idempotently (re)generate the shared sandbox home. Called before every
 * container ensure — cheap writes, and re-running picks up notify.sh
 * updates without an image rebuild.
 */
export function ensureSandboxHome(): string {
	const homeDir = getSandboxHomeDir();
	for (const sub of ["bin", "bash", "hooks"]) {
		mkdirSync(join(homeDir, sub), { recursive: true });
	}

	writeFileSync(join(homeDir, "bash", "rcfile"), buildContainerBashRcfile(), {
		mode: 0o644,
	});

	const hostNotifyScript = join(getSupersetHomeDir(), "hooks", "notify.sh");
	if (existsSync(hostNotifyScript)) {
		const target = join(homeDir, "hooks", "notify.sh");
		copyFileSync(hostNotifyScript, target);
	}

	return homeDir;
}
