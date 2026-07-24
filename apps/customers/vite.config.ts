import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss(),
	],
	resolve: {
		alias: {
			"@": "/src",
		},
	},
	// Expose the monorepo's NEXT_PUBLIC_* vars (loaded by dotenv-cli in the
	// dev script) and satisfy @superset/auth/client's process.env read.
	envPrefix: ["VITE_", "NEXT_PUBLIC_"],
	define: {
		"process.env.NEXT_PUBLIC_API_URL": JSON.stringify(
			process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
		),
	},
});
