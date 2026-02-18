/**
 * Remote Clipboard Service
 *
 * Bridges the local clipboard to remote SSH hosts for TUI apps.
 * - Uploads images via SFTP to ~/.superset/clipboard/
 * - Deploys clipboard proxy scripts to ~/.superset/bin/
 * - Proxy scripts intercept xclip/pngpaste/xsel/wl-paste reads
 *   and serve the most recently uploaded image.
 */

import type { SSHConnection } from "./connection";
import type { SFTPService } from "./sftp-service";

const CLIPBOARD_DIR = ".superset/clipboard";
const BIN_DIR = ".superset/bin";
const MAX_CLIPBOARD_FILES = 5;
const PROXY_MARKER = "# superset-clipboard-proxy v5";

export class RemoteClipboardService {
	private connection: SSHConnection;
	private sftp: SFTPService;
	private proxyDeployed = false;
	private _homeDir: string | null = null;

	constructor(connection: SSHConnection, sftp: SFTPService) {
		this.connection = connection;
		this.sftp = sftp;
	}

	setConnection(connection: SSHConnection): void {
		this.connection = connection;
		this.proxyDeployed = false;
	}

	/**
	 * Upload an image to the remote clipboard directory.
	 * Returns the absolute path of the uploaded file.
	 */
	async uploadImage(imageBuffer: Buffer, mimeType: string): Promise<string> {
		const homeDir = await this.getHomeDir();
		const clipboardDir = `${homeDir}/${CLIPBOARD_DIR}`;
		const ext = mimeType === "image/jpeg" ? "jpg" : "png";
		const filename = `clipboard-${Date.now()}.${ext}`;
		const remotePath = `${clipboardDir}/${filename}`;

		// Ensure directory exists
		await this.connection.exec(`mkdir -p '${clipboardDir}'`);

		// Write the image file
		await this.sftp.writeFile(remotePath, imageBuffer);

		// Update the "latest" symlink so proxy scripts always serve the newest image
		await this.connection.exec(
			`ln -sf '${remotePath}' '${clipboardDir}/latest'`,
		);

		// Cleanup old files in the background
		void this.cleanupOldFiles(clipboardDir).catch(() => {});

		return remotePath;
	}

	/**
	 * Verify remote clipboard read path across Linux and macOS style commands.
	 */
	async verifyImageReadPath(): Promise<{ ok: boolean; details: string[] }> {
		const homeDir = await this.getHomeDir();
		const clipboardDir = `${homeDir}/${CLIPBOARD_DIR}`;
		const result = await this.connection.exec(
			[
				'export PATH="$HOME/.superset/bin:$PATH"',
				`if [ -f '${clipboardDir}/latest' ]; then echo latest_exists; else echo latest_missing; fi`,
				'if xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp)" >/dev/null || wl-paste -l 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp)" >/dev/null; then echo checkImage_ok; else echo checkImage_fail; fi',
				"if xclip -selection clipboard -t image/png -o >/dev/null 2>&1 || wl-paste --type image/png >/dev/null 2>&1 || pbpaste >/dev/null 2>&1; then echo readImage_ok; else echo readImage_fail; fi",
				"if command -v xclip >/dev/null 2>&1; then echo xclip_path:$(command -v xclip); fi",
				"if command -v wl-paste >/dev/null 2>&1; then echo wl_paste_path:$(command -v wl-paste); fi",
				"if command -v pbpaste >/dev/null 2>&1; then echo pbpaste_path:$(command -v pbpaste); fi",
			].join("; "),
		);

		const details = result.stdout
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		const ok =
			details.includes("latest_exists") && details.includes("readImage_ok");
		return { ok, details };
	}

	/**
	 * Deploy clipboard proxy scripts to ~/.superset/bin/.
	 * Idempotent: skips files that already have the proxy marker.
	 */
	async ensureProxyScripts(): Promise<void> {
		if (this.proxyDeployed) return;

		const homeDir = await this.getHomeDir();
		const binDir = `${homeDir}/${BIN_DIR}`;
		const clipboardDir = `${homeDir}/${CLIPBOARD_DIR}`;

		await this.connection.exec(`mkdir -p '${binDir}' '${clipboardDir}'`);

		const scripts = buildProxyScripts(clipboardDir);

		for (const [name, content] of Object.entries(scripts)) {
			const scriptPath = `${binDir}/${name}`;

			// Check if our proxy is already installed
			const check = await this.connection
				.exec(`head -2 '${scriptPath}' 2>/dev/null`)
				.catch(() => ({ stdout: "", stderr: "", code: 1 }));

			if (check.stdout.includes(PROXY_MARKER)) continue;

			await this.sftp.writeFile(scriptPath, content);
			await this.connection.exec(`chmod +x '${scriptPath}'`);
		}

		this.proxyDeployed = true;
	}

	private async cleanupOldFiles(clipboardDir: string): Promise<void> {
		await this.connection.exec(
			`cd '${clipboardDir}' && ls -t clipboard-* 2>/dev/null | tail -n +${MAX_CLIPBOARD_FILES + 1} | xargs rm -f 2>/dev/null`,
		);
	}

	private async getHomeDir(): Promise<string> {
		if (this._homeDir) return this._homeDir;
		const result = await this.connection.exec("echo $HOME");
		this._homeDir = result.stdout.trim();
		return this._homeDir;
	}
}

// ---------------------------------------------------------------------------
// Proxy script generators
// ---------------------------------------------------------------------------

function buildProxyScripts(clipboardDir: string): Record<string, string> {
	// Helper to generate the "find real binary" logic, skipping our bin dir
	const findReal = (bin: string) => `
_real=""
IFS=: read -ra _path_parts <<< "$PATH"
for _dir in "\${_path_parts[@]}"; do
  [[ -z "$_dir" ]] && continue
  case "$_dir" in */.superset/bin) continue ;; esac
  if [[ -x "$_dir/${bin}" ]]; then
    _real="$_dir/${bin}"
    break
  fi
done`;

	const xclip = `#!/bin/bash
${PROXY_MARKER}
# Proxy xclip: serve Superset clipboard images, forward everything else.

_output=false _target=""
_args=("$@")

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|-out|--output) _output=true; shift ;;
    -t|-target|--target) _target="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ "$_output" == true ]] && [[ "$_target" == TARGETS || "$_target" == targets ]]; then
  _f="${clipboardDir}/latest"
  if [[ -f "$_f" ]]; then
    printf '%s\n' "TARGETS" "image/png" "image/jpeg" "image/webp"
    exit 0
  fi
fi

if [[ "$_output" == true ]] && [[ "$_target" == image/* ]]; then
  _f="${clipboardDir}/latest"
  [[ -f "$_f" ]] && { cat "$_f"; exit 0; }
fi
${findReal("xclip")}
[[ -n "$_real" ]] && exec "$_real" "\${_args[@]}"
exit 1
`;

	const pngpaste = `#!/bin/bash
${PROXY_MARKER}
# Proxy pngpaste: serve Superset clipboard images.

_out="\${1:--}"
_f="${clipboardDir}/latest"

if [[ -f "$_f" ]]; then
  if [[ "$_out" == "-" ]]; then cat "$_f"; else cp "$_f" "$_out"; fi
  exit 0
fi
${findReal("pngpaste")}
[[ -n "$_real" ]] && exec "$_real" "$@"
exit 1
`;

	const xsel = `#!/bin/bash
${PROXY_MARKER}
# Proxy xsel: serve Superset clipboard images.

_args=("$@")
_clipboard=false _output=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --clipboard|-b) _clipboard=true; shift ;;
    --output|-o) _output=true; shift ;;
    *) shift ;;
  esac
done
if [[ "$_clipboard" == true ]] && [[ "$_output" == true ]]; then
  _f="${clipboardDir}/latest"
  [[ -f "$_f" ]] && { cat "$_f"; exit 0; }
fi
${findReal("xsel")}
[[ -n "$_real" ]] && exec "$_real" "\${_args[@]}"
exit 1
`;

	const wlPaste = `#!/bin/bash
${PROXY_MARKER}
# Proxy wl-paste: serve Superset clipboard images.

_args=("$@")
for _arg in "$@"; do
  if [[ "$_arg" == "--list-types" || "$_arg" == "-l" ]]; then
    _f="${clipboardDir}/latest"
    if [[ -f "$_f" ]]; then
      printf '%s\n' "image/png" "image/jpeg" "image/webp"
      exit 0
    fi
  fi
done
_is_image=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --type|-t)
      [[ "$2" == image/* ]] && _is_image=true
      shift 2
      ;;
    *)
      [[ "$1" == image/* ]] && _is_image=true
      shift
      ;;
  esac
done
if [[ "$_is_image" == true ]]; then
  _f="${clipboardDir}/latest"
  [[ -f "$_f" ]] && { cat "$_f"; exit 0; }
fi
${findReal("wl-paste")}
[[ -n "$_real" ]] && exec "$_real" "\${_args[@]}"
exit 1
`;

	const pbpaste = `#!/bin/bash
${PROXY_MARKER}
# Proxy pbpaste: serve Superset clipboard images for SSH sessions.

_f="${clipboardDir}/latest"
if [[ -f "$_f" ]]; then
  cat "$_f"
  exit 0
fi
${findReal("pbpaste")}
[[ -n "$_real" ]] && exec "$_real" "$@"
exit 1
`;

	return {
		xclip,
		pngpaste,
		xsel,
		"wl-paste": wlPaste,
		pbpaste,
	};
}
