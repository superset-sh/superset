import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CLIError, positional } from "@superset/cli-framework";
import { PLUGIN_MANIFEST_FILENAME } from "@superset/plugin-sdk/manifest";
import { command } from "../../../lib/command";

function displayName(name: string): string {
	return name
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function manifestTemplate(name: string): string {
	const label = displayName(name);
	return `${JSON.stringify(
		{
			id: `local.${name}`,
			name: label,
			version: "0.1.0",
			description: "A Superset plugin",
			server: "src/server.ts",
			app: "dist/app.js",
			contributes: {
				commands: [
					{
						id: "ping",
						title: `${label}: Ping`,
						run: { type: "action", action: "ping" },
					},
				],
				sidebarTabs: [
					{ id: "main", label: label.slice(0, 40), component: "MainTab" },
				],
			},
		},
		null,
		"\t",
	)}\n`;
}

const SERVER_TEMPLATE = `import { definePlugin } from "@superset/plugin-sdk";

export default definePlugin((api) => {
	api.actions.register("ping", (params) => ({
		pong: true,
		params,
		at: new Date().toISOString(),
	}));

	api.events.on("*", (event) => {
		api.log(\`event: \${event.kind}\`, { workspaceId: event.workspaceId });
	});

	// Manifest event hooks spawn a command on lifecycle events. To try one,
	// add under "contributes" in ${PLUGIN_MANIFEST_FILENAME}:
	// "events": [{ "on": "workspace.created", "command": ["echo", "workspace created"] }]
});
`;

const APP_TEMPLATE = `import { useState } from "react";
import type { PluginSlotProps } from "@superset/plugin-sdk/ui";

export function MainTab({ ctx }: PluginSlotProps) {
	const [result, setResult] = useState<string | null>(null);
	return (
		<div style={{ padding: 12 }}>
			<h3>{ctx.pluginId}</h3>
			<p>Workspace: {ctx.workspaceId}</p>
			<button
				type="button"
				onClick={async () => {
					const response = await ctx.invokeAction("ping");
					setResult(JSON.stringify(response, null, 2));
				}}
			>
				Ping
			</button>
			{result ? <pre>{result}</pre> : null}
		</div>
	);
}
`;

function packageJsonTemplate(name: string): string {
	return `${JSON.stringify(
		{
			name,
			version: "0.1.0",
			private: true,
			type: "module",
			scripts: { build: "superset plugin build" },
			devDependencies: {
				"@superset/plugin-sdk": "workspace:*",
				"@types/react": "19.2.14",
				typescript: "6.0.3",
			},
		},
		null,
		"\t",
	)}\n`;
}

const TSCONFIG_TEMPLATE = `${JSON.stringify(
	{
		compilerOptions: {
			strict: true,
			noEmit: true,
			target: "ES2022",
			module: "ESNext",
			moduleResolution: "bundler",
			jsx: "react-jsx",
			lib: ["ES2022", "DOM"],
			skipLibCheck: true,
		},
		include: ["src"],
	},
	null,
	"\t",
)}\n`;

const GITIGNORE_TEMPLATE = "dist/\nnode_modules/\n";

export default command({
	description: "Scaffold a new plugin directory",
	args: [positional("name").required().desc("Plugin name (lowercase, dashes)")],
	skipMiddleware: true,
	run: async ({ args }) => {
		const name = args.name as string;
		if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
			throw new CLIError(
				"Plugin name must be lowercase letters, digits, and dashes",
				"Example: superset plugin new review-board",
			);
		}
		const dir = path.resolve(name);
		if (existsSync(dir)) {
			throw new CLIError(`Directory already exists: ${dir}`);
		}

		await mkdir(path.join(dir, "src"), { recursive: true });
		await writeFile(
			path.join(dir, PLUGIN_MANIFEST_FILENAME),
			manifestTemplate(name),
		);
		await writeFile(path.join(dir, "src", "server.ts"), SERVER_TEMPLATE);
		await writeFile(path.join(dir, "src", "app.tsx"), APP_TEMPLATE);
		await writeFile(path.join(dir, "package.json"), packageJsonTemplate(name));
		await writeFile(path.join(dir, "tsconfig.json"), TSCONFIG_TEMPLATE);
		await writeFile(path.join(dir, ".gitignore"), GITIGNORE_TEMPLATE);

		const id = `local.${name}`;
		return {
			data: { dir, id },
			message: [
				`Created plugin ${id} in ${dir}`,
				"Next steps:",
				`  cd ${name}`,
				"  superset plugin build",
				"  superset plugin link",
			].join("\n"),
		};
	},
});
