import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	AlertCircle,
	Bold,
	ChevronRight,
	Info,
	Italic,
	Mail,
	Star,
	Underline,
	User,
} from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { Toggle, ToggleIcon } from "@/components/ui/toggle";
import {
	ToggleGroup,
	ToggleGroupIcon,
	ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCollections } from "@/providers/CollectionsProvider";

export function DemoScreen() {
	const collections = useCollections();

	// Live queries
	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const { data: allTasks } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);

	const { data: activeTasks } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	const { data: taskStatuses } = useLiveQuery(
		(q) => q.from({ taskStatuses: collections.taskStatuses }),
		[collections],
	);

	const { data: repositories } = useLiveQuery(
		(q) => q.from({ repositories: collections.repositories }),
		[collections],
	);

	const { data: members } = useLiveQuery(
		(q) => q.from({ members: collections.members }),
		[collections],
	);

	const { data: users } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const { data: invitations } = useLiveQuery(
		(q) => q.from({ invitations: collections.invitations }),
		[collections],
	);

	const { data: tasksWithStatus } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.select(({ tasks, status }) => ({
					id: tasks.id,
					title: tasks.title,
					statusName: status.name,
					statusColor: status.color,
				})),
		[collections],
	);

	// Component state
	const [checkboxChecked, setCheckboxChecked] = React.useState(false);
	const [switchChecked, setSwitchChecked] = React.useState(false);
	const [radioValue, setRadioValue] = React.useState("option-1");
	const [selectValue, setSelectValue] = React.useState<
		{ value: string; label: string } | undefined
	>(undefined);
	const [progressValue, setProgressValue] = React.useState(33);
	const [togglePressed, setTogglePressed] = React.useState(false);
	const [toggleGroupValue, setToggleGroupValue] = React.useState<string[]>([]);
	const [collapsibleOpen, setCollapsibleOpen] = React.useState(false);
	const [tabValue, setTabValue] = React.useState("tab1");
	const [inputValue, setInputValue] = React.useState("");
	const [textareaValue, setTextareaValue] = React.useState("");

	return (
		<ScrollView className="flex-1 bg-background">
			<View className="p-6 gap-6">
				{/* Header */}
				<View className="gap-2">
					<Text className="text-4xl font-bold">Component Demo</Text>
					<Text className="text-lg text-muted-foreground">
						All UI components + real-time synced data
					</Text>
				</View>

				<OrganizationSwitcher />

				<Separator />

				{/* ── Buttons ── */}
				<Card>
					<CardHeader>
						<CardTitle>Button</CardTitle>
						<CardDescription>All button variants and sizes</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<View className="flex-row flex-wrap gap-2">
							<Button>
								<Text>Default</Text>
							</Button>
							<Button variant="secondary">
								<Text>Secondary</Text>
							</Button>
							<Button variant="destructive">
								<Text>Destructive</Text>
							</Button>
							<Button variant="outline">
								<Text>Outline</Text>
							</Button>
							<Button variant="ghost">
								<Text>Ghost</Text>
							</Button>
							<Button variant="link">
								<Text>Link</Text>
							</Button>
						</View>
						<View className="flex-row flex-wrap gap-2">
							<Button size="sm">
								<Text>Small</Text>
							</Button>
							<Button size="default">
								<Text>Default</Text>
							</Button>
							<Button size="lg">
								<Text>Large</Text>
							</Button>
							<Button size="icon">
								<Icon as={Star} size={16} className="text-primary-foreground" />
							</Button>
						</View>
					</CardContent>
				</Card>

				{/* ── Badge ── */}
				<Card>
					<CardHeader>
						<CardTitle>Badge</CardTitle>
						<CardDescription>Status indicators</CardDescription>
					</CardHeader>
					<CardContent>
						<View className="flex-row flex-wrap gap-2">
							<Badge>
								<Text>Default</Text>
							</Badge>
							<Badge variant="secondary">
								<Text>Secondary</Text>
							</Badge>
							<Badge variant="destructive">
								<Text>Destructive</Text>
							</Badge>
							<Badge variant="outline">
								<Text>Outline</Text>
							</Badge>
						</View>
					</CardContent>
				</Card>

				{/* ── Alert ── */}
				<Card>
					<CardHeader>
						<CardTitle>Alert</CardTitle>
						<CardDescription>Informational messages</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<Alert icon={Info}>
							<AlertTitle>Heads up!</AlertTitle>
							<AlertDescription>
								This is a default alert component.
							</AlertDescription>
						</Alert>
						<Alert icon={AlertCircle} variant="destructive">
							<AlertTitle>Error</AlertTitle>
							<AlertDescription>
								Something went wrong. Please try again.
							</AlertDescription>
						</Alert>
					</CardContent>
				</Card>

				{/* ── Avatar ── */}
				<Card>
					<CardHeader>
						<CardTitle>Avatar</CardTitle>
						<CardDescription>User profile images with fallback</CardDescription>
					</CardHeader>
					<CardContent>
						<View className="flex-row gap-3 items-center">
							<Avatar alt="Satya Patel">
								<AvatarFallback>
									<Text className="text-xs">SP</Text>
								</AvatarFallback>
							</Avatar>
							<Avatar alt="Kiet Ho">
								<AvatarFallback>
									<Text className="text-xs">KH</Text>
								</AvatarFallback>
							</Avatar>
							<Avatar alt="User" className="size-12">
								<AvatarFallback>
									<Icon as={User} size={20} className="text-muted-foreground" />
								</AvatarFallback>
							</Avatar>
						</View>
					</CardContent>
				</Card>

				{/* ── Input & Textarea ── */}
				<Card>
					<CardHeader>
						<CardTitle>Input & Textarea</CardTitle>
						<CardDescription>Text input fields</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<View className="gap-2">
							<Label>Email</Label>
							<Input
								placeholder="you@example.com"
								value={inputValue}
								onChangeText={setInputValue}
							/>
						</View>
						<View className="gap-2">
							<Label>Message</Label>
							<Textarea
								placeholder="Type your message here..."
								value={textareaValue}
								onChangeText={setTextareaValue}
							/>
						</View>
					</CardContent>
				</Card>

				{/* ── Checkbox & Switch ── */}
				<Card>
					<CardHeader>
						<CardTitle>Checkbox & Switch</CardTitle>
						<CardDescription>Toggle controls</CardDescription>
					</CardHeader>
					<CardContent className="gap-4">
						<Pressable
							className="flex-row items-center gap-3"
							onPress={() => setCheckboxChecked(!checkboxChecked)}
						>
							<Checkbox
								checked={checkboxChecked}
								onCheckedChange={setCheckboxChecked}
							/>
							<Label>Accept terms and conditions</Label>
						</Pressable>
						<View className="flex-row items-center justify-between">
							<Label>Enable notifications</Label>
							<Switch
								checked={switchChecked}
								onCheckedChange={setSwitchChecked}
							/>
						</View>
					</CardContent>
				</Card>

				{/* ── Radio Group ── */}
				<Card>
					<CardHeader>
						<CardTitle>Radio Group</CardTitle>
						<CardDescription>Single selection</CardDescription>
					</CardHeader>
					<CardContent>
						<RadioGroup value={radioValue} onValueChange={setRadioValue}>
							<Pressable
								className="flex-row items-center gap-3"
								onPress={() => setRadioValue("option-1")}
							>
								<RadioGroupItem value="option-1" />
								<Label>Option One</Label>
							</Pressable>
							<Pressable
								className="flex-row items-center gap-3"
								onPress={() => setRadioValue("option-2")}
							>
								<RadioGroupItem value="option-2" />
								<Label>Option Two</Label>
							</Pressable>
							<Pressable
								className="flex-row items-center gap-3"
								onPress={() => setRadioValue("option-3")}
							>
								<RadioGroupItem value="option-3" />
								<Label>Option Three</Label>
							</Pressable>
						</RadioGroup>
					</CardContent>
				</Card>

				{/* ── Select ── */}
				<Card>
					<CardHeader>
						<CardTitle>Select</CardTitle>
						<CardDescription>Dropdown selection</CardDescription>
					</CardHeader>
					<CardContent>
						<Select value={selectValue} onValueChange={setSelectValue}>
							<SelectTrigger>
								<SelectValue placeholder="Select a fruit" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem label="Apple" value="apple">
									Apple
								</SelectItem>
								<SelectItem label="Banana" value="banana">
									Banana
								</SelectItem>
								<SelectItem label="Cherry" value="cherry">
									Cherry
								</SelectItem>
							</SelectContent>
						</Select>
					</CardContent>
				</Card>

				{/* ── Progress ── */}
				<Card>
					<CardHeader>
						<CardTitle>Progress</CardTitle>
						<CardDescription>
							Value: {progressValue}% — tap buttons to change
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<Progress value={progressValue} />
						<View className="flex-row gap-2">
							<Button
								size="sm"
								variant="outline"
								onPress={() => setProgressValue((v) => Math.max(0, v - 10))}
							>
								<Text>-10</Text>
							</Button>
							<Button
								size="sm"
								variant="outline"
								onPress={() => setProgressValue((v) => Math.min(100, v + 10))}
							>
								<Text>+10</Text>
							</Button>
						</View>
					</CardContent>
				</Card>

				{/* ── Tabs ── */}
				<Card>
					<CardHeader>
						<CardTitle>Tabs</CardTitle>
						<CardDescription>Tabbed content</CardDescription>
					</CardHeader>
					<CardContent>
						<Tabs value={tabValue} onValueChange={setTabValue}>
							<TabsList>
								<TabsTrigger value="tab1">
									<Text>Account</Text>
								</TabsTrigger>
								<TabsTrigger value="tab2">
									<Text>Password</Text>
								</TabsTrigger>
							</TabsList>
							<TabsContent value="tab1">
								<Text className="text-sm text-muted-foreground py-2">
									Make changes to your account here.
								</Text>
							</TabsContent>
							<TabsContent value="tab2">
								<Text className="text-sm text-muted-foreground py-2">
									Change your password here.
								</Text>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>

				{/* ── Accordion ── */}
				<Card>
					<CardHeader>
						<CardTitle>Accordion</CardTitle>
						<CardDescription>Expandable sections</CardDescription>
					</CardHeader>
					<CardContent>
						<Accordion type="multiple" collapsable>
							<AccordionItem value="item-1">
								<AccordionTrigger>
									<Text>Is it accessible?</Text>
								</AccordionTrigger>
								<AccordionContent>
									<Text className="text-muted-foreground">
										Yes. It follows WAI-ARIA design patterns.
									</Text>
								</AccordionContent>
							</AccordionItem>
							<AccordionItem value="item-2">
								<AccordionTrigger>
									<Text>Is it styled?</Text>
								</AccordionTrigger>
								<AccordionContent>
									<Text className="text-muted-foreground">
										Yes. It comes with default styles from shadcn/ui.
									</Text>
								</AccordionContent>
							</AccordionItem>
							<AccordionItem value="item-3">
								<AccordionTrigger>
									<Text>Is it animated?</Text>
								</AccordionTrigger>
								<AccordionContent>
									<Text className="text-muted-foreground">
										Yes. It uses Reanimated for smooth native animations.
									</Text>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</CardContent>
				</Card>

				{/* ── Collapsible ── */}
				<Card>
					<CardHeader>
						<CardTitle>Collapsible</CardTitle>
						<CardDescription>Toggle content visibility</CardDescription>
					</CardHeader>
					<CardContent>
						<Collapsible
							open={collapsibleOpen}
							onOpenChange={setCollapsibleOpen}
						>
							<View className="flex-row items-center justify-between">
								<Text className="text-sm font-semibold">3 items tagged</Text>
								<CollapsibleTrigger asChild>
									<Button variant="ghost" size="sm">
										<Icon
											as={ChevronRight}
											size={16}
											className="text-foreground"
										/>
									</Button>
								</CollapsibleTrigger>
							</View>
							<View className="mt-2 rounded-md border border-border px-4 py-2">
								<Text className="text-sm">@tanstack/db</Text>
							</View>
							<CollapsibleContent>
								<View className="mt-2 gap-2">
									<View className="rounded-md border border-border px-4 py-2">
										<Text className="text-sm">@rn-primitives/accordion</Text>
									</View>
									<View className="rounded-md border border-border px-4 py-2">
										<Text className="text-sm">@rn-primitives/dialog</Text>
									</View>
								</View>
							</CollapsibleContent>
						</Collapsible>
					</CardContent>
				</Card>

				{/* ── Dialog ── */}
				<Card>
					<CardHeader>
						<CardTitle>Dialog</CardTitle>
						<CardDescription>Modal dialog</CardDescription>
					</CardHeader>
					<CardContent>
						<Dialog>
							<DialogTrigger asChild>
								<Button variant="outline">
									<Text>Open Dialog</Text>
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Edit Profile</DialogTitle>
									<DialogDescription>
										Make changes to your profile here. Click save when you're
										done.
									</DialogDescription>
								</DialogHeader>
								<View className="gap-3">
									<View className="gap-2">
										<Label>Name</Label>
										<Input placeholder="Your name" />
									</View>
								</View>
								<DialogFooter>
									<Button>
										<Text>Save changes</Text>
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</CardContent>
				</Card>

				{/* ── Alert Dialog ── */}
				<Card>
					<CardHeader>
						<CardTitle>Alert Dialog</CardTitle>
						<CardDescription>Confirmation dialog</CardDescription>
					</CardHeader>
					<CardContent>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="destructive">
									<Text>Delete Item</Text>
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Are you sure?</AlertDialogTitle>
									<AlertDialogDescription>
										This action cannot be undone. This will permanently delete
										your data.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>
										<Text>Cancel</Text>
									</AlertDialogCancel>
									<AlertDialogAction>
										<Text>Continue</Text>
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</CardContent>
				</Card>

				{/* ── Popover ── */}
				<Card>
					<CardHeader>
						<CardTitle>Popover</CardTitle>
						<CardDescription>Floating content</CardDescription>
					</CardHeader>
					<CardContent>
						<Popover>
							<PopoverTrigger asChild>
								<Button variant="outline">
									<Text>Open Popover</Text>
								</Button>
							</PopoverTrigger>
							<PopoverContent>
								<View className="gap-2">
									<Text className="text-sm font-medium">Dimensions</Text>
									<Text className="text-xs text-muted-foreground">
										Set the dimensions for the layer.
									</Text>
									<View className="gap-2">
										<View className="gap-1">
											<Label>Width</Label>
											<Input placeholder="100%" />
										</View>
										<View className="gap-1">
											<Label>Height</Label>
											<Input placeholder="25px" />
										</View>
									</View>
								</View>
							</PopoverContent>
						</Popover>
					</CardContent>
				</Card>

				{/* ── Tooltip ── */}
				<Card>
					<CardHeader>
						<CardTitle>Tooltip</CardTitle>
						<CardDescription>Hover/press for info</CardDescription>
					</CardHeader>
					<CardContent>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="outline" size="icon">
									<Icon as={Mail} size={16} className="text-foreground" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<Text>Send email</Text>
							</TooltipContent>
						</Tooltip>
					</CardContent>
				</Card>

				{/* ── Toggle ── */}
				<Card>
					<CardHeader>
						<CardTitle>Toggle</CardTitle>
						<CardDescription>Pressable toggle buttons</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<Toggle
							pressed={togglePressed}
							onPressedChange={setTogglePressed}
							variant="outline"
						>
							<ToggleIcon as={Bold} />
							<Text>Bold</Text>
						</Toggle>
					</CardContent>
				</Card>

				{/* ── Toggle Group ── */}
				<Card>
					<CardHeader>
						<CardTitle>Toggle Group</CardTitle>
						<CardDescription>Grouped toggle options</CardDescription>
					</CardHeader>
					<CardContent>
						<ToggleGroup
							type="multiple"
							value={toggleGroupValue}
							onValueChange={setToggleGroupValue}
							variant="outline"
						>
							<ToggleGroupItem value="bold" isFirst>
								<ToggleGroupIcon as={Bold} />
							</ToggleGroupItem>
							<ToggleGroupItem value="italic">
								<ToggleGroupIcon as={Italic} />
							</ToggleGroupItem>
							<ToggleGroupItem value="underline" isLast>
								<ToggleGroupIcon as={Underline} />
							</ToggleGroupItem>
						</ToggleGroup>
					</CardContent>
				</Card>

				{/* ── Skeleton ── */}
				<Card>
					<CardHeader>
						<CardTitle>Skeleton</CardTitle>
						<CardDescription>Loading placeholders</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<View className="flex-row items-center gap-3">
							<Skeleton className="size-10 rounded-full" />
							<View className="gap-2 flex-1">
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-3 w-1/2" />
							</View>
						</View>
					</CardContent>
				</Card>

				{/* ── Aspect Ratio ── */}
				<Card>
					<CardHeader>
						<CardTitle>Aspect Ratio</CardTitle>
						<CardDescription>16:9 container</CardDescription>
					</CardHeader>
					<CardContent>
						<AspectRatio ratio={16 / 9}>
							<View className="flex-1 items-center justify-center rounded-md bg-muted">
								<Text className="text-sm text-muted-foreground">
									16:9 Content Area
								</Text>
							</View>
						</AspectRatio>
					</CardContent>
				</Card>

				<Separator />

				{/* ── Data Section ── */}
				<View className="gap-2">
					<Text className="text-2xl font-bold">Live Data</Text>
					<Text className="text-sm text-muted-foreground">
						Real-time synced from Electric SQL
					</Text>
				</View>

				<Card>
					<CardHeader>
						<CardTitle>Organizations (Global)</CardTitle>
						<CardDescription>
							{organizations?.length || 0} total
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{organizations?.map((org) => (
							<Text key={org.id} className="text-sm">
								{org.name} {org.slug && `(@${org.slug})`}
							</Text>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Tasks</CardTitle>
						<CardDescription>
							{allTasks?.length || 0} total ({activeTasks?.length || 0} active)
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{activeTasks?.slice(0, 5).map((task) => (
							<Text key={task.id} className="text-sm">
								{task.title}
							</Text>
						))}
						{(activeTasks?.length || 0) > 5 && (
							<Text className="text-sm text-muted-foreground">
								...and {(activeTasks?.length ?? 0) - 5} more
							</Text>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Task Statuses</CardTitle>
						<CardDescription>{taskStatuses?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{taskStatuses?.map((status) => (
							<View key={status.id} className="flex-row items-center gap-2">
								{status.color && (
									<View
										className="w-3 h-3 rounded-full"
										style={{ backgroundColor: status.color }}
									/>
								)}
								<Text className="text-sm">{status.name}</Text>
							</View>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Repositories</CardTitle>
						<CardDescription>{repositories?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{repositories?.slice(0, 5).map((repo) => (
							<Text key={repo.id} className="text-sm">
								{repo.name}
							</Text>
						))}
						{(repositories?.length || 0) > 5 && (
							<Text className="text-sm text-muted-foreground">
								...and {(repositories?.length ?? 0) - 5} more
							</Text>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Members</CardTitle>
						<CardDescription>{members?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{members?.map((member) => (
							<Text key={member.id} className="text-sm">
								{member.role}
							</Text>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Users</CardTitle>
						<CardDescription>{users?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{users?.map((user) => (
							<Text key={user.id} className="text-sm">
								{user.name || user.email}
							</Text>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Invitations</CardTitle>
						<CardDescription>{invitations?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{invitations?.map((inv) => (
							<Text key={inv.id} className="text-sm">
								{inv.email} - {inv.status}
							</Text>
						))}
						{!invitations?.length && (
							<Text className="text-sm text-muted-foreground">
								No pending invitations
							</Text>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Advanced Query (Join)</CardTitle>
						<CardDescription>
							Tasks with their status names ({tasksWithStatus?.length || 0})
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{tasksWithStatus?.slice(0, 5).map((item) => (
							<View key={item.id} className="flex-row items-center gap-2">
								{item.statusColor && (
									<View
										className="w-2 h-2 rounded-full"
										style={{ backgroundColor: item.statusColor }}
									/>
								)}
								<Text className="text-sm flex-1">{item.title}</Text>
								<Text className="text-xs text-muted-foreground">
									{item.statusName}
								</Text>
							</View>
						))}
					</CardContent>
				</Card>
			</View>
		</ScrollView>
	);
}
