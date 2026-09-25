// `bun dev` runs this on a laptop and inside a cloud sandbox alike. The one
// thing Electron forces apart is root: it refuses to start as root unless
// `--no-sandbox` is on its command line (an env var arrives too late), and the
// sandbox runs everything as root. electron-vite's `--noSandbox` puts it there.
const asRoot = process.platform === "linux" && process.getuid?.() === 0;
const child = Bun.spawn(
	[
		"electron-vite",
		"dev",
		"--watch",
		...(asRoot ? ["--noSandbox"] : []),
		...process.argv.slice(2),
	],
	{
		stdio: ["inherit", "inherit", "inherit"],
		env: {
			...process.env,
			NODE_ENV: "development",
			NODE_OPTIONS: "--max-old-space-size=8192",
		},
	},
);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
	process.on(signal, () => child.kill(signal));
}
process.exit(await child.exited);
