import type { IconType } from "react-icons";
import {
	LuBoxes,
	LuFlame,
	LuGlobe,
	LuLayers,
	LuMessageSquare,
	LuSmartphone,
} from "react-icons/lu";
import gstackBanner from "./assets/gstack.png";
import honoBanner from "./assets/hono.png";
import nextjsBanner from "./assets/nextjs.png";
import nextjsChatbotBanner from "./assets/nextjs-chatbot.png";
import reactNativeBanner from "./assets/react-native.png";
import t3TurboBanner from "./assets/t3-turbo.png";

export interface ProjectTemplate {
	id: string;
	name: string;
	description: string;
	icon: IconType;
	bannerClassName: string;
	repo?: string;
	banner?: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
	{
		id: "gstack",
		name: "gstack",
		description: "Garry Tan's role-based Claude Code workflow",
		icon: LuLayers,
		bannerClassName: "bg-zinc-900 text-white",
		repo: "https://github.com/garrytan/gstack",
		banner: gstackBanner,
	},
	{
		id: "nextjs",
		name: "Next.js",
		description: "Vercel's starter with Drizzle, NextAuth, and Postgres",
		icon: LuGlobe,
		bannerClassName: "bg-black text-white",
		repo: "https://github.com/vercel/nextjs-postgres-auth-starter",
		banner: nextjsBanner,
	},
	{
		id: "nextjs-chatbot",
		name: "Next.js Chatbot",
		description: "AI chatbot built with Next.js and the AI SDK",
		icon: LuMessageSquare,
		bannerClassName: "bg-black text-white",
		repo: "https://github.com/vercel/ai-chatbot",
		banner: nextjsChatbotBanner,
	},
	{
		id: "react-native",
		name: "React Native",
		description: "Cross-platform mobile app with Expo",
		icon: LuSmartphone,
		bannerClassName: "bg-blue-500 text-white",
		repo: "https://github.com/expo/expo-template-default",
		banner: reactNativeBanner,
	},
	{
		id: "t3-turbo",
		name: "T3 Turbo",
		description: "Full-stack Turborepo with Next.js, Expo, and tRPC",
		icon: LuBoxes,
		bannerClassName: "bg-purple-700 text-white",
		repo: "https://github.com/t3-oss/create-t3-turbo",
		banner: t3TurboBanner,
	},
	{
		id: "hono",
		name: "React Router + Hono",
		description: "Fullstack template on Cloudflare Workers",
		icon: LuFlame,
		bannerClassName: "bg-orange-600 text-white",
		repo: "https://github.com/cloudflare/react-router-hono-fullstack-template",
		banner: honoBanner,
	},
];
