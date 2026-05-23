import type { Meta, StoryObj } from "@storybook/react-native";
import {
	Bell,
	Check,
	ChevronRight,
	Code,
	FileText,
	Home,
	Image as ImageIcon,
	Info,
	type LucideIcon,
	MessageSquare,
	Plus,
	Search,
	Send,
	Settings,
	StopCircle,
	Trash2,
	TriangleAlert,
	User,
	X,
} from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const GALLERY: { name: string; icon: LucideIcon }[] = [
	{ name: "Home", icon: Home },
	{ name: "Search", icon: Search },
	{ name: "Settings", icon: Settings },
	{ name: "Bell", icon: Bell },
	{ name: "User", icon: User },
	{ name: "MessageSquare", icon: MessageSquare },
	{ name: "Send", icon: Send },
	{ name: "Plus", icon: Plus },
	{ name: "Check", icon: Check },
	{ name: "X", icon: X },
	{ name: "ChevronRight", icon: ChevronRight },
	{ name: "StopCircle", icon: StopCircle },
	{ name: "Trash2", icon: Trash2 },
	{ name: "FileText", icon: FileText },
	{ name: "Code", icon: Code },
	{ name: "ImageIcon", icon: ImageIcon },
	{ name: "Info", icon: Info },
	{ name: "TriangleAlert", icon: TriangleAlert },
];

function IconsGallery() {
	return (
		<ScrollView className="flex-1 bg-background">
			<View className="p-4">
				<Text variant="h3" className="mb-2">
					Icon library
				</Text>
				<Text variant="muted" className="mb-6">
					lucide-react-native via the Icon wrapper in components/ui/icon.tsx
					(uniwind-styled).
				</Text>

				<Text variant="small" className="text-muted-foreground mb-2">
					size-6 · text-foreground
				</Text>
				<View className="flex-row flex-wrap gap-4 mb-8">
					{GALLERY.map(({ name, icon }) => (
						<View key={name} className="items-center w-20">
							<Icon as={icon} className="size-6 text-foreground" />
							<Text variant="small" className="text-muted-foreground mt-1">
								{name}
							</Text>
						</View>
					))}
				</View>

				<Text variant="small" className="text-muted-foreground mb-2">
					Color tokens
				</Text>
				<View className="flex-row gap-4">
					<View className="items-center">
						<Icon as={Check} className="size-8 text-primary" />
						<Text variant="small" className="text-muted-foreground mt-1">
							primary
						</Text>
					</View>
					<View className="items-center">
						<Icon as={Bell} className="size-8 text-accent-foreground" />
						<Text variant="small" className="text-muted-foreground mt-1">
							accent-fg
						</Text>
					</View>
					<View className="items-center">
						<Icon as={TriangleAlert} className="size-8 text-destructive" />
						<Text variant="small" className="text-muted-foreground mt-1">
							destructive
						</Text>
					</View>
					<View className="items-center">
						<Icon as={Info} className="size-8 text-muted-foreground" />
						<Text variant="small" className="text-muted-foreground mt-1">
							muted-fg
						</Text>
					</View>
				</View>

				<Text variant="small" className="text-muted-foreground mt-8 mb-2">
					Sizes
				</Text>
				<View className="flex-row items-end gap-4">
					{["size-3", "size-4", "size-5", "size-6", "size-8", "size-10"].map(
						(s) => (
							<View key={s} className="items-center">
								<Icon as={MessageSquare} className={`${s} text-foreground`} />
								<Text variant="small" className="text-muted-foreground mt-1">
									{s}
								</Text>
							</View>
						),
					)}
				</View>
			</View>
		</ScrollView>
	);
}

const meta: Meta<typeof IconsGallery> = {
	title: "Design System/Icons",
	component: IconsGallery,
};

export default meta;

type Story = StoryObj<typeof IconsGallery>;

export const Default: Story = {};
