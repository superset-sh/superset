export type NewProjectMode = "empty" | "clone" | "template";

export interface ProjectTemplate {
	id: string;
	name: string;
	description: string;
	url: string;
	tags?: string[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
	{
		id: "nextjs",
		name: "Next.js",
		description:
			"React framework with App Router, TypeScript, and Tailwind CSS",
		url: "https://github.com/vercel/next.js/tree/canary/examples/hello-world",
		tags: ["react", "typescript"],
	},
	{
		id: "vite-react",
		name: "Vite + React",
		description: "Fast React development with Vite, TypeScript, and ESLint",
		url: "https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts",
		tags: ["react", "typescript"],
	},
	{
		id: "astro",
		name: "Astro",
		description:
			"Content-focused static site generator with island architecture",
		url: "https://github.com/withastro/astro/tree/main/examples/minimal",
		tags: ["static", "typescript"],
	},
	{
		id: "express",
		name: "Express",
		description: "Minimal Node.js web framework for APIs and web apps",
		url: "https://github.com/expressjs/generator",
		tags: ["node", "api"],
	},
];
