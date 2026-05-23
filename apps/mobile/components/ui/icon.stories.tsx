import type { Meta, StoryObj } from "@storybook/react-native";
import {
	AlertTriangle,
	ArrowDown,
	ArrowLeft,
	ArrowUpRight,
	Bell,
	Check,
	ChevronDown,
	ChevronRight,
	Circle,
	Copy,
	GitBranch,
	Laptop,
	type LucideIcon,
	MoreVertical,
	Package,
	Send,
	Settings,
	Shield,
	Sparkles,
	Square,
	WifiOff,
	X,
	Zap,
} from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const CATALOG: { name: string; icon: LucideIcon; usage: string }[] = [
	{ name: "Send", icon: Send, usage: "Composer Send button" },
	{ name: "Square", icon: Square, usage: "Composer Stop button" },
	{ name: "X", icon: X, usage: "Close affordances" },
	{ name: "ArrowLeft", icon: ArrowLeft, usage: "Back navigation" },
	{ name: "MoreVertical", icon: MoreVertical, usage: "Session overflow ···" },
	{ name: "Copy", icon: Copy, usage: "Copy code block / message" },
	{ name: "Check", icon: Check, usage: "Approve / selected state" },
	{ name: "Circle", icon: Circle, usage: "Status dot base" },
	{
		name: "ChevronDown",
		icon: ChevronDown,
		usage: "Picker triggers · expanded",
	},
	{ name: "ChevronRight", icon: ChevronRight, usage: "Collapsed sections" },
	{ name: "ArrowDown", icon: ArrowDown, usage: "Scroll-back FAB" },
	{ name: "ArrowUpRight", icon: ArrowUpRight, usage: "External link" },
	{ name: "Package", icon: Package, usage: "📦 Plan block" },
	{ name: "GitBranch", icon: GitBranch, usage: "🌿 Workspace branch" },
	{ name: "Laptop", icon: Laptop, usage: "💻 Host (desktop)" },
	{ name: "Bell", icon: Bell, usage: "🔔 Push notification prompt" },
	{ name: "Shield", icon: Shield, usage: "🔐 Permission mode" },
	{ name: "Zap", icon: Zap, usage: "⚡ Thinking level" },
	{ name: "Settings", icon: Settings, usage: "⚙ Filter button" },
	{ name: "WifiOff", icon: WifiOff, usage: "Host offline banner" },
	{ name: "AlertTriangle", icon: AlertTriangle, usage: "Warning banners" },
	{ name: "Sparkles", icon: Sparkles, usage: "AI / generated content" },
];

function IconCatalogShowcase({
	colorClass,
	sizeClass,
}: {
	colorClass: string;
	sizeClass: string;
}) {
	return (
		<ScrollView className="flex-1">
			<Text variant="muted" className="mb-4">
				Click an icon name in the catalog to inspect. All icons are
				lucide-react-native, themed via the Icon wrapper (size + color
				className).
			</Text>
			<View className="gap-3">
				{CATALOG.map(({ name, icon, usage }) => (
					<View key={name} className="flex-row items-center gap-3">
						<View className="w-10 items-center">
							<Icon as={icon} className={`${sizeClass} ${colorClass}`} />
						</View>
						<View className="flex-1">
							<Text className="font-semibold">{name}</Text>
							<Text variant="small" className="text-muted-foreground">
								{usage}
							</Text>
						</View>
					</View>
				))}
			</View>
		</ScrollView>
	);
}

const meta: Meta<typeof IconCatalogShowcase> = {
	title: "Components/Icon",
	component: IconCatalogShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Themed wrapper around lucide-react-native via withUniwind. Catalog covers chat-view icon usage. Add new icons by importing from lucide-react-native and passing via `as` prop — no per-icon wrappers needed.",
			},
		},
	},
	args: {
		colorClass: "text-foreground",
		sizeClass: "size-5",
	},
	argTypes: {
		colorClass: {
			control: { type: "select" },
			options: [
				"text-foreground",
				"text-muted-foreground",
				"text-primary",
				"text-destructive",
				"text-state-live-fg",
				"text-state-warning-fg",
			],
		},
		sizeClass: {
			control: { type: "select" },
			options: ["size-3", "size-4", "size-5", "size-6", "size-8"],
		},
	},
};

export default meta;

type Story = StoryObj<typeof IconCatalogShowcase>;

export const Catalog: Story = {};
export const Ember: Story = { args: { colorClass: "text-primary" } };
export const Large: Story = { args: { sizeClass: "size-8" } };
export const Live: Story = { args: { colorClass: "text-state-live-fg" } };
