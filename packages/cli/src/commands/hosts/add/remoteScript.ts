import { CLIError } from "@superset/cli-framework";

export const INSTALLER_URL = "https://superset.sh/cli/install.sh";

export interface RemoteProbe {
	os: string;
	arch: string;
	/** Absolute path to an existing superset binary, or null if absent. */
	bin: string | null;
	version: string | null;
	hasCurl: boolean;
	/**
	 * Linux only. "empty" means every host id derived on this box collides
	 * with every other box whose /etc/machine-id is empty.
	 */
	machineId: "empty" | "present" | "unknown";
}

/** POSIX-sh single-quoting, safe for arbitrary values. */
export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Looks for the CLI in the install prefix and the usual bin directories before
 * falling back to PATH. PATH is the unreliable one: the installer appends its
 * export to a shell rc file, and `ssh host 'cmd'` runs a non-interactive shell
 * that never sources it (zsh reads only .zshenv; Ubuntu's .bashrc returns early
 * when non-interactive). A freshly installed CLI is therefore invisible to
 * `command -v` on the very next command.
 */
export function buildProbeScript(): string {
	return `set -u
printf 'os=%s\\n' "$(uname -s 2>/dev/null || echo unknown)"
printf 'arch=%s\\n' "$(uname -m 2>/dev/null || echo unknown)"

bin=''
for candidate in "\${SUPERSET_HOME:-$HOME/superset}/bin/superset" "$HOME/.local/bin/superset" /usr/local/bin/superset; do
  if [ -x "$candidate" ]; then bin="$candidate"; break; fi
done
if [ -z "$bin" ]; then
  onpath="$(command -v superset 2>/dev/null || true)"
  if [ -n "$onpath" ]; then bin="$onpath"; fi
fi
printf 'bin=%s\\n' "$bin"

version=''
if [ -n "$bin" ]; then version="$("$bin" --version 2>/dev/null | head -n 1 || true)"; fi
printf 'version=%s\\n' "$version"

if command -v curl >/dev/null 2>&1; then printf 'curl=yes\\n'; else printf 'curl=no\\n'; fi

machine_id=unknown
if [ "$(uname -s 2>/dev/null)" = "Linux" ]; then
  content=''
  if [ -r /etc/machine-id ]; then content="$(cat /etc/machine-id 2>/dev/null || true)"; fi
  if [ -z "$content" ] && [ -r /var/lib/dbus/machine-id ]; then
    content="$(cat /var/lib/dbus/machine-id 2>/dev/null || true)"
  fi
  if [ -z "$content" ]; then machine_id=empty; else machine_id=present; fi
fi
printf 'machine_id=%s\\n' "$machine_id"
`;
}

export function parseProbe(stdout: string): RemoteProbe {
	const fields = new Map<string, string>();
	for (const line of stdout.split("\n")) {
		const eq = line.indexOf("=");
		if (eq > 0) fields.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
	}

	const os = fields.get("os");
	const arch = fields.get("arch");
	if (!os || !arch) {
		throw new CLIError(
			"Could not read the machine's platform over SSH",
			stdout.trim()
				? `The remote shell answered:\n${stdout.trim()}`
				: "The remote shell produced no output.",
		);
	}

	const bin = fields.get("bin") || null;
	const version = fields.get("version") || null;
	const machineId = fields.get("machine_id");

	return {
		os,
		arch,
		bin,
		version,
		hasCurl: fields.get("curl") === "yes",
		machineId:
			machineId === "empty" || machineId === "present" ? machineId : "unknown",
	};
}

/** Targets the installer publishes; anything else has no tarball to download. */
const SUPPORTED_ARCH = new Set([
	"x86_64",
	"amd64",
	"arm64",
	"aarch64",
	"aarch64_be",
]);

export function assertInstallable(probe: RemoteProbe): void {
	if (probe.os !== "Linux" && probe.os !== "Darwin") {
		throw new CLIError(
			`Superset has no build for ${probe.os}`,
			"The installer supports Linux and macOS only.",
		);
	}
	if (!SUPPORTED_ARCH.has(probe.arch)) {
		throw new CLIError(
			`Superset has no build for ${probe.os} ${probe.arch}`,
			"The installer supports x64 and arm64 only.",
		);
	}
}

export interface SetupScriptOptions {
	/** Existing binary to reuse; null installs first. */
	bin: string | null;
	apiKey: string;
	organizationId: string;
	/** Pins SUPERSET_VERSION for the installer; omit for the latest release. */
	version?: string;
	installerUrl?: string;
}

/**
 * Installs if needed, stores the credential, starts the daemon, and prints
 * `superset status --json` on stdout. Everything else is redirected to stderr
 * so stdout stays a single parseable JSON document.
 */
export function buildSetupScript(options: SetupScriptOptions): string {
	const installerUrl = options.installerUrl ?? INSTALLER_URL;
	const pin = options.version
		? `SUPERSET_VERSION=${shellQuote(options.version)}\nexport SUPERSET_VERSION\n`
		: "";
	const locate = options.bin
		? `BIN=${shellQuote(options.bin)}\n`
		: `${pin}curl -fsSL ${shellQuote(installerUrl)} | sh 1>&2\nBIN="\${SUPERSET_HOME:-$HOME/superset}/bin/superset"\n`;

	return `set -eu
umask 077
ORG=${shellQuote(options.organizationId)}
SUPERSET_API_KEY=${shellQuote(options.apiKey)}
export SUPERSET_API_KEY

${locate}
if [ ! -x "$BIN" ]; then
  echo "superset is not executable at $BIN" 1>&2
  exit 1
fi

# The key reaches this box on stdin, never through argv -- except on the next
# line. The auth login command accepts an API key only as a flag (it inspects
# argv), so for that one call the key is visible to ps here. It buys a device
# that stays logged in; the alternative is a daemon holding the key only in
# its environment, gone on the next reboot.
"$BIN" auth login --api-key "$SUPERSET_API_KEY" --organization "$ORG" 1>&2
"$BIN" start --daemon --org "$ORG" 1>&2
"$BIN" status --json --org "$ORG"
`;
}

export function parseHostId(stdout: string): string {
	const start = stdout.indexOf("{");
	const end = stdout.lastIndexOf("}");
	if (start !== -1 && end > start) {
		try {
			const parsed: unknown = JSON.parse(stdout.slice(start, end + 1));
			if (parsed && typeof parsed === "object" && "hostId" in parsed) {
				const hostId = (parsed as { hostId: unknown }).hostId;
				if (typeof hostId === "string" && hostId) return hostId;
			}
		} catch {
			// Fall through to the shared error below.
		}
	}
	throw new CLIError(
		"The host started but did not report its id",
		stdout.trim()
			? `superset status answered:\n${stdout.trim()}`
			: "superset status produced no output.",
	);
}
