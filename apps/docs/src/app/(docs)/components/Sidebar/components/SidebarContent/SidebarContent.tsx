import {
	BookOpen,
	CircleHelp,
	Gauge,
	type LucideIcon,
	Rocket,
} from "lucide-react";
import { source } from "@/lib/source";

interface SidebarItem {
	title: string;
	href: string;
}

interface SidebarSection {
	title: string;
	Icon: LucideIcon;
	items: SidebarItem[];
}

const iconMap: Record<string, LucideIcon> = {
	Rocket,
	Gauge,
	BookOpen,
	CircleHelp,
};

function parseSections(): SidebarSection[] {
	const pageTree = source.pageTree;
	const sections: SidebarSection[] = [];
	let currentSection: SidebarSection | null = null;

	for (const node of pageTree.children) {
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
		} else if (node.type === "page" && currentSection) {
			currentSection.items.push({
				title: String(node.name ?? ""),
				href: node.url,
			});
		}
	}

	return sections;
}

export const sections: SidebarSection[] = parseSections();
