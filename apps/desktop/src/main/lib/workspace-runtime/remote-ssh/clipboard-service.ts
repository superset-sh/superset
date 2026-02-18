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
const PROXY_MARKER = "# superset-clipboard-proxy v1";

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
    -o) _output=true; shift ;;
    -t|-target) _target="$2"; shift 2 ;;
    *) shift ;;
  esac
done

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
if [[ "$*" == *"--clipboard"* ]] && [[ "$*" == *"--output"* ]]; then
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
if [[ "$*" == *image* ]]; then
  _f="${clipboardDir}/latest"
  [[ -f "$_f" ]] && { cat "$_f"; exit 0; }
fi
${findReal("wl-paste")}
[[ -n "$_real" ]] && exec "$_real" "\${_args[@]}"
exit 1
`;

	return {
		xclip,
		pngpaste,
		xsel,
		"wl-paste": wlPaste,
	};
}
