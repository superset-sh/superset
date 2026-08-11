"use client";

import { Calendar } from "@superset/ui/calendar";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@superset/ui/field";
import { Input } from "@superset/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
	InputGroupTextarea,
} from "@superset/ui/input-group";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@superset/ui/input-otp";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Slider } from "@superset/ui/slider";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { SearchIcon, SendIcon } from "lucide-react";
import { useState } from "react";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

export function InputsSection() {
	const [date, setDate] = useState<Date | undefined>(new Date(2026, 6, 24));

	return (
		<ShowcaseSection
			id="inputs"
			index="02"
			title="Inputs"
			description="Form controls and field composition"
		>
			<ComponentCard title="Input" importPath="@superset/ui/input">
				<div className="w-full max-w-64 space-y-3">
					<Input placeholder="Email address" type="email" />
					<Input placeholder="Disabled" disabled />
					<Input aria-invalid placeholder="Invalid" />
				</div>
			</ComponentCard>

			<ComponentCard title="Textarea" importPath="@superset/ui/textarea">
				<Textarea
					placeholder="Describe the task for the agent…"
					className="max-w-72"
				/>
			</ComponentCard>

			<ComponentCard title="Input Group" importPath="@superset/ui/input-group">
				<div className="w-full max-w-72 space-y-3">
					<InputGroup>
						<InputGroupInput placeholder="Search workspaces…" />
						<InputGroupAddon>
							<SearchIcon />
						</InputGroupAddon>
					</InputGroup>
					<InputGroup>
						<InputGroupInput placeholder="superset" />
						<InputGroupAddon align="inline-end">
							<InputGroupText>.sh</InputGroupText>
						</InputGroupAddon>
					</InputGroup>
					<InputGroup>
						<InputGroupTextarea placeholder="Ask the agent…" />
						<InputGroupAddon align="block-end">
							<InputGroupButton size="sm" className="ml-auto" variant="default">
								Send <SendIcon />
							</InputGroupButton>
						</InputGroupAddon>
					</InputGroup>
				</div>
			</ComponentCard>

			<ComponentCard title="Select" importPath="@superset/ui/select">
				<Select defaultValue="sonnet">
					<SelectTrigger className="w-56">
						<SelectValue placeholder="Pick a model" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectLabel>Claude</SelectLabel>
							<SelectItem value="fable">Fable 5</SelectItem>
							<SelectItem value="opus">Opus 4.8</SelectItem>
							<SelectItem value="sonnet">Sonnet 5</SelectItem>
							<SelectItem value="haiku">Haiku 4.5</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</ComponentCard>

			<ComponentCard
				title="Checkbox · Radio · Switch"
				importPath="@superset/ui/checkbox"
				description="Also: @superset/ui/radio-group, @superset/ui/switch"
			>
				<div className="flex flex-col gap-4">
					<div className="flex items-center gap-2">
						<Checkbox id="dsg-terms" defaultChecked />
						<Label htmlFor="dsg-terms">Accept terms</Label>
					</div>
					<RadioGroup defaultValue="auto" className="flex gap-4">
						<div className="flex items-center gap-2">
							<RadioGroupItem value="auto" id="dsg-auto" />
							<Label htmlFor="dsg-auto">Auto</Label>
						</div>
						<div className="flex items-center gap-2">
							<RadioGroupItem value="manual" id="dsg-manual" />
							<Label htmlFor="dsg-manual">Manual</Label>
						</div>
					</RadioGroup>
					<div className="flex items-center gap-2">
						<Switch id="dsg-notify" defaultChecked />
						<Label htmlFor="dsg-notify">Notifications</Label>
					</div>
				</div>
			</ComponentCard>

			<ComponentCard title="Slider" importPath="@superset/ui/slider">
				<div className="w-full max-w-64 space-y-6">
					<Slider defaultValue={[60]} max={100} step={1} />
					<Slider defaultValue={[25, 75]} max={100} step={5} />
				</div>
			</ComponentCard>

			<ComponentCard title="Input OTP" importPath="@superset/ui/input-otp">
				<InputOTP maxLength={6}>
					<InputOTPGroup>
						<InputOTPSlot index={0} />
						<InputOTPSlot index={1} />
						<InputOTPSlot index={2} />
					</InputOTPGroup>
					<InputOTPSeparator />
					<InputOTPGroup>
						<InputOTPSlot index={3} />
						<InputOTPSlot index={4} />
						<InputOTPSlot index={5} />
					</InputOTPGroup>
				</InputOTP>
			</ComponentCard>

			<ComponentCard
				title="Field"
				importPath="@superset/ui/field"
				description="Composable form layout — pairs with @superset/ui/form for react-hook-form"
			>
				<FieldSet className="w-full max-w-72">
					<FieldLegend>Workspace</FieldLegend>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="dsg-ws-name">Name</FieldLabel>
							<Input id="dsg-ws-name" placeholder="component-showcase" />
							<FieldDescription>
								Shown in the sidebar and task list.
							</FieldDescription>
						</Field>
						<Field data-invalid>
							<FieldLabel htmlFor="dsg-ws-branch">Branch</FieldLabel>
							<Input id="dsg-ws-branch" aria-invalid defaultValue="main " />
							<FieldError>Branch names cannot end with a space.</FieldError>
						</Field>
					</FieldGroup>
				</FieldSet>
			</ComponentCard>

			<ComponentCard title="Calendar" importPath="@superset/ui/calendar" span>
				<Calendar
					mode="single"
					selected={date}
					onSelect={setDate}
					className="rounded-lg border"
				/>
			</ComponentCard>
		</ShowcaseSection>
	);
}
