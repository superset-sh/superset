import { cn } from "@superset/ui/utils";
import {
	LuBraces,
	LuGlobe,
	LuLayoutDashboard,
	LuServer,
	LuSmartphone,
	LuTerminal,
} from "react-icons/lu";

const TEMPLATES = [
	{
		name: "Next.js",
		description: "Full-stack React framework with SSR and API routes",
		icon: LuGlobe,
		color: "text-white bg-black",
	},
	{
		name: "Vite + React",
		description: "Fast build tool with React and TypeScript",
		icon: LuBraces,
		color: "text-white bg-violet-500",
	},
	{
		name: "Express API",
		description: "Minimal Node.js REST API server",
		icon: LuServer,
		color: "text-white bg-green-600",
	},
	{
		name: "Astro",
		description: "Content-focused static site generator",
		icon: LuLayoutDashboard,
		color: "text-white bg-orange-500",
	},
	{
		name: "React Native",
		description: "Cross-platform mobile app with Expo",
		icon: LuSmartphone,
		color: "text-white bg-blue-500",
	},
	{
		name: "CLI Tool",
		description: "Command-line application with TypeScript",
		icon: LuTerminal,
		color: "text-white bg-zinc-700",
	},
];

export function TemplateTab() {
	return (
		<div className="grid grid-cols-2 gap-3">
			{TEMPLATES.map((template) => (
				<button
					key={template.name}
					type="button"
					disabled
					className="flex items-start gap-3 rounded-lg border border-border/50 p-3.5 text-left opacity-60 cursor-not-allowed"
				>
					<div
						className={cn(
							"flex items-center justify-center size-9 rounded-lg shrink-0",
							template.color,
						)}
					>
						<template.icon className="size-4.5" />
					</div>
					<div className="min-w-0">
						<div className="text-sm font-medium text-foreground">
							{template.name}
						</div>
						<div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
							{template.description}
						</div>
					</div>
				</button>
			))}
			<div className="col-span-2 text-center py-2">
				<p className="text-xs text-muted-foreground">Templates coming soon</p>
			</div>
		</div>
	);
}
