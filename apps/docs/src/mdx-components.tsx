import { Card, Cards } from "fumadocs-ui/components/card";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import {
	BookOpen,
	Bot,
	CalendarClock,
	Download,
	Github,
	GitPullRequest,
	Globe,
	Layers,
	Linkedin,
	Mail,
	MessageCircle,
	Newspaper,
	Package,
	Plug,
	Rocket,
	Split,
	Terminal,
	Twitter,
	Workflow,
	Youtube,
} from "lucide-react";
import type { MDXComponents } from "mdx/types";
import {
	Command,
	CommandReturns,
	HumanOutput,
	JsonOutput,
} from "@/components/Command";
import { DatabaseTable } from "@/components/DatabaseTable";
import { DownloadButton } from "@/components/DownloadButton";
import { ResourceCard } from "@/components/ResourceCard";
import { ResourceGrid } from "@/components/ResourceGrid";
import { YouTubeVideo } from "@/components/YouTubeVideo";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
	return {
		...defaultMdxComponents,
		Card,
		Cards,
		BookOpen,
		Bot,
		CalendarClock,
		Github,
		Linkedin,
		Mail,
		MessageCircle,
		Newspaper,
		Twitter,
		Youtube,
		Download,
		GitPullRequest,
		Globe,
		Layers,
		Package,
		Plug,
		Rocket,
		Split,
		Terminal,
		Workflow,
		Command,
		CommandReturns,
		HumanOutput,
		JsonOutput,
		DownloadButton,
		DatabaseTable,
		ResourceCard,
		ResourceGrid,
		YouTubeVideo,
		Tab,
		Tabs,
		...components,
	};
}
