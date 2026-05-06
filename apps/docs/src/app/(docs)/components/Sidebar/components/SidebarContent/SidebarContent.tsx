import {
	BookOpen,
	CircleHelp,
	Gauge,
	type LucideIcon,
	Rocket,
	Terminal,
} from "lucide-react";
import { source } from "@/lib/source";

interface SidebarItem {
	title: string;
	href: string;
}

export interface SidebarSection {
	title: string;
	Icon: LucideIcon;
	items: SidebarItem[];
}

const iconMap: Record<string, LucideIcon> = {
	Rocket,
	Gauge,
	BookOpen,
	CircleHelp,
	Terminal,
};

interface PageTreeNode {
	type: string;
	name?: unknown;
	url?: string;
	children?: PageTreeNode[];
}

function parseSectionsFromSeparators(nodes: PageTreeNode[]): SidebarSection[] {
	const sections: SidebarSection[] = [];
	let currentSection: SidebarSection | null = null;

	const visit = (node: PageTreeNode) => {
		if (node.type === "separator") {
			const name = String(node.name ?? "");
			const match = name.match(/^(\w+)\s+(.+)$/);
			if (match) {
				const [, iconName, title] = match;
				currentSection = {
					title,
					Icon: iconMap[iconName] || Rocket,
					items: [],
				};
				sections.push(currentSection);
			}
		} else if (node.type === "page" && currentSection && node.url) {
			currentSection.items.push({
				title: String(node.name ?? ""),
				href: node.url,
			});
		} else if (node.type === "folder" && node.children) {
			for (const child of node.children) visit(child);
		}
	};

	for (const node of nodes) visit(node);

	return sections;
}

function buildSections(): SidebarSection[] {
	const tree = source.pageTree as { children: PageTreeNode[] };
	return parseSectionsFromSeparators(tree.children);
}

export const sections: SidebarSection[] = buildSections();
