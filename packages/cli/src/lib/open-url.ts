import { spawn } from "node:child_process";

export function openUrl(url: string): Promise<void> {
	const [bin, args]: [string, string[]] =
		process.platform === "darwin"
			? ["open", [url]]
			: process.platform === "win32"
				? ["cmd", ["/c", "start", "", url]]
				: ["xdg-open", [url]];

	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { stdio: "ignore", detached: true });
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}
