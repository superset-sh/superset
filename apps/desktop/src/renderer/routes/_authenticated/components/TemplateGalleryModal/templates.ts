import type { IconType } from "react-icons";
import {
	LuBoxes,
	LuFlame,
	LuGlobe,
	LuLayers,
	LuMessageSquare,
	LuSmartphone,
} from "react-icons/lu";

export interface ProjectTemplate {
	id: string;
	name: string;
	description: string;
	icon: IconType;
	bannerClassName: string;
	repo?: string;
}

/**
 * GitHub's auto-generated repo social card, used as the card banner image.
 */
export function templateBannerImage(repo: string | undefined): string | null {
	if (!repo) return null;
	const match = repo.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
	if (!match) return null;
	return `https://opengraph.githubassets.com/1/${match[1]}/${match[2]}`;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
	{
		id: "gstack",
		name: "gstack",
		description: "Garry Tan's role-based Claude Code workflow",
		icon: LuLayers,
		bannerClassName: "bg-zinc-900 text-white",
		repo: "https://github.com/garrytan/gstack",
	},
	{
		id: "nextjs",
		name: "Next.js",
		description: "Vercel's starter with Drizzle, NextAuth, and Postgres",
		icon: LuGlobe,
		bannerClassName: "bg-black text-white",
		repo: "https://github.com/vercel/nextjs-postgres-auth-starter",
	},
	{
		id: "nextjs-chatbot",
		name: "Next.js Chatbot",
		description: "AI chatbot built with Next.js and the AI SDK",
		icon: LuMessageSquare,
		bannerClassName: "bg-black text-white",
		repo: "https://github.com/vercel/ai-chatbot",
	},
	{
		id: "react-native",
		name: "React Native",
		description: "Cross-platform mobile app with Expo",
		icon: LuSmartphone,
		bannerClassName: "bg-blue-500 text-white",
		repo: "https://github.com/expo/expo-template-default",
	},
	{
		id: "t3-turbo",
		name: "T3 Turbo",
		description: "Full-stack Turborepo with Next.js, Expo, and tRPC",
		icon: LuBoxes,
		bannerClassName: "bg-purple-700 text-white",
		repo: "https://github.com/t3-oss/create-t3-turbo",
	},
	{
		id: "hono",
		name: "React Router + Hono",
		description: "Fullstack template on Cloudflare Workers",
		icon: LuFlame,
		bannerClassName: "bg-orange-600 text-white",
		repo: "https://github.com/cloudflare/react-router-hono-fullstack-template",
	},
];
