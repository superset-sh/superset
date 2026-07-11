import type {
	ElicitationResult,
	PendingElicitationRequest,
	PendingPermissionRequest,
	PendingUserDialogRequest,
	SessionPermissionResult,
	UserDialogResult,
} from "@superset/session-protocol";
import { type ReactNode, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { parseAskUserQuestions } from "../../utils/sessionMessages";
import { buildQuestionAnswers } from "./questionAnswers";

export function PendingActions({
	permissions,
	userDialogs,
	elicitations,
	onPermission,
	onQuestion,
	onUserDialog,
	onElicitation,
	disabled,
}: {
	permissions: PendingPermissionRequest[];
	userDialogs: PendingUserDialogRequest[];
	elicitations: PendingElicitationRequest[];
	onPermission: (
		requestId: string,
		response: SessionPermissionResult,
	) => Promise<void>;
	onQuestion: (
		request: PendingPermissionRequest,
		answers: Record<string, string>,
	) => Promise<void>;
	onUserDialog: (
		requestId: string,
		response: UserDialogResult,
	) => Promise<void>;
	onElicitation: (
		requestId: string,
		response: ElicitationResult,
	) => Promise<void>;
	disabled: boolean;
}) {
	if (
		permissions.length === 0 &&
		userDialogs.length === 0 &&
		elicitations.length === 0
	) {
		return null;
	}

	return (
		<ScrollView
			className="max-h-[45%]"
			contentContainerClassName="gap-2 px-3 pb-2"
			keyboardShouldPersistTaps="handled"
			testID="claude-pending-actions"
		>
			{permissions.map((request) => {
				const questions = parseAskUserQuestions(request);
				return questions ? (
					<QuestionCard
						disabled={disabled}
						key={request.requestId}
						onDeny={() =>
							onPermission(request.requestId, {
								behavior: "deny",
								message: "User declined the question",
								toolUseID: request.toolUseID,
								decisionClassification: "user_reject",
							})
						}
						onSubmit={(answers) => onQuestion(request, answers)}
						questions={questions}
					/>
				) : (
					<PermissionCard
						disabled={disabled}
						key={request.requestId}
						onRespond={(response) => onPermission(request.requestId, response)}
						request={request}
					/>
				);
			})}
			{elicitations.map((request) => (
				<ElicitationCard
					disabled={disabled}
					key={request.requestId}
					onRespond={(response) => onElicitation(request.requestId, response)}
					request={request}
				/>
			))}
			{userDialogs.map((request) => (
				<ForwardCompatibleDialogCard
					disabled={disabled}
					key={request.requestId}
					onCancel={() =>
						onUserDialog(request.requestId, { behavior: "cancelled" })
					}
					request={request}
				/>
			))}
		</ScrollView>
	);
}

function PermissionCard({
	request,
	onRespond,
	disabled,
}: {
	request: PendingPermissionRequest;
	onRespond: (response: SessionPermissionResult) => Promise<void>;
	disabled: boolean;
}) {
	const [busy, setBusy] = useState(false);
	const isPlan = request.toolName === "ExitPlanMode";
	const respond = async (response: SessionPermissionResult) => {
		setBusy(true);
		try {
			await onRespond(response);
		} finally {
			setBusy(false);
		}
	};

	return (
		<ActionCard
			description={request.description ?? request.decisionReason}
			title={
				request.title ??
				(isPlan ? "Claude wants to leave plan mode" : request.toolName)
			}
		>
			<Text
				className="text-muted-foreground font-mono text-xs"
				numberOfLines={8}
			>
				{JSON.stringify(request.input, null, 2)}
			</Text>
			<View className="flex-row justify-end gap-2">
				<Button
					disabled={busy || disabled}
					onPress={() =>
						void respond({
							behavior: "deny",
							message: isPlan ? "User rejected the plan" : "User denied access",
							toolUseID: request.toolUseID,
							decisionClassification: "user_reject",
						})
					}
					size="sm"
					testID={`claude-permission-${request.requestId}-deny`}
					variant="outline"
				>
					<Text>{isPlan ? "Reject" : "Deny"}</Text>
				</Button>
				{request.suggestions?.length ? (
					<Button
						disabled={busy || disabled}
						onPress={() =>
							void respond({
								behavior: "allow",
								updatedInput: request.input,
								updatedPermissions: request.suggestions,
								toolUseID: request.toolUseID,
								decisionClassification: "user_permanent",
							})
						}
						size="sm"
						testID={`claude-permission-${request.requestId}-always-allow`}
						variant="secondary"
					>
						<Text>Always allow</Text>
					</Button>
				) : null}
				<Button
					disabled={busy || disabled}
					onPress={() =>
						void respond({
							behavior: "allow",
							updatedInput: request.input,
							toolUseID: request.toolUseID,
							decisionClassification: "user_temporary",
						})
					}
					size="sm"
					testID={`claude-permission-${request.requestId}-allow`}
				>
					<Text>{isPlan ? "Approve" : "Allow once"}</Text>
				</Button>
			</View>
		</ActionCard>
	);
}

type ParsedQuestions = NonNullable<ReturnType<typeof parseAskUserQuestions>>;

function QuestionCard({
	questions,
	onSubmit,
	onDeny,
	disabled,
}: {
	questions: ParsedQuestions;
	onSubmit: (answers: Record<string, string>) => Promise<void>;
	onDeny: () => Promise<void>;
	disabled: boolean;
}) {
	const [selected, setSelected] = useState<Record<string, string[]>>({});
	const [custom, setCustom] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const complete = questions.every(
		(question) =>
			(selected[question.question]?.length ?? 0) > 0 ||
			Boolean(custom[question.question]?.trim()),
	);
	const submit = async () => {
		setBusy(true);
		try {
			await onSubmit(buildQuestionAnswers(questions, selected, custom));
		} finally {
			setBusy(false);
		}
	};
	const deny = async () => {
		setBusy(true);
		try {
			await onDeny();
		} finally {
			setBusy(false);
		}
	};

	return (
		<ActionCard title="Claude has a question">
			{questions.map((question) => (
				<View className="gap-1" key={question.question}>
					{question.header ? (
						<Text className="text-muted-foreground text-xs uppercase">
							{question.header}
						</Text>
					) : null}
					<Text className="font-medium text-sm">{question.question}</Text>
					{question.options.map((option) => {
						const active = selected[question.question]?.includes(option.label);
						return (
							<Pressable
								className={cn(
									"rounded-lg border px-3 py-2",
									active ? "border-primary bg-primary/10" : "border-border",
								)}
								disabled={busy || disabled}
								key={option.label}
								onPress={() =>
									setSelected((current) => {
										const prior = current[question.question] ?? [];
										const next = question.multiSelect
											? prior.includes(option.label)
												? prior.filter((value) => value !== option.label)
												: [...prior, option.label]
											: [option.label];
										return { ...current, [question.question]: next };
									})
								}
								testID={`claude-question-option-${option.label}`}
							>
								<Text className="text-sm">{option.label}</Text>
								{option.description ? (
									<Text className="text-muted-foreground mt-0.5 text-xs">
										{option.description}
									</Text>
								) : null}
							</Pressable>
						);
					})}
					<Input
						editable={!busy && !disabled}
						onChangeText={(value) =>
							setCustom((current) => ({
								...current,
								[question.question]: value,
							}))
						}
						placeholder="Or type another answer"
						value={custom[question.question] ?? ""}
					/>
				</View>
			))}
			<View className="flex-row justify-end gap-2">
				<Button
					disabled={busy || disabled}
					onPress={() => void deny()}
					size="sm"
					testID="claude-question-decline"
					variant="outline"
				>
					<Text>Decline</Text>
				</Button>
				<Button
					disabled={busy || disabled || !complete}
					onPress={() => void submit()}
					size="sm"
					testID="claude-question-submit"
				>
					<Text>Submit answers</Text>
				</Button>
			</View>
		</ActionCard>
	);
}

interface ElicitationField {
	name: string;
	title: string;
	type: "string" | "number" | "boolean" | "string[]";
	required: boolean;
	allowedValues?: string[];
}

function elicitationSchema(request: PendingElicitationRequest): {
	fields: ElicitationField[];
	unsupportedRequired: string[];
} {
	const schema = request.requestedSchema;
	const properties = schema?.properties;
	const required = Array.isArray(schema?.required)
		? schema.required.filter(
				(value): value is string => typeof value === "string",
			)
		: [];
	if (!isRecord(properties)) {
		return { fields: [], unsupportedRequired: required };
	}

	const fields: ElicitationField[] = [];
	const unsupportedRequired: string[] = [];
	for (const [name, value] of Object.entries(properties)) {
		if (!isRecord(value)) {
			if (required.includes(name)) unsupportedRequired.push(name);
			continue;
		}
		const type = value.type;
		const isStringArray =
			type === "array" &&
			isRecord(value.items) &&
			value.items.type === "string";
		if (
			type !== "string" &&
			type !== "number" &&
			type !== "boolean" &&
			!isStringArray
		) {
			if (required.includes(name)) unsupportedRequired.push(name);
			continue;
		}
		const allowedValues = Array.isArray(value.enum)
			? value.enum.filter((entry): entry is string => typeof entry === "string")
			: undefined;
		fields.push({
			name,
			title: typeof value.title === "string" ? value.title : name,
			type: isStringArray
				? "string[]"
				: (type as "string" | "number" | "boolean"),
			required: required.includes(name),
			...(allowedValues?.length ? { allowedValues } : {}),
		});
	}
	for (const requiredName of required) {
		if (!(requiredName in properties)) unsupportedRequired.push(requiredName);
	}
	return { fields, unsupportedRequired: [...new Set(unsupportedRequired)] };
}

function ElicitationCard({
	request,
	onRespond,
	disabled,
}: {
	request: PendingElicitationRequest;
	onRespond: (response: ElicitationResult) => Promise<void>;
	disabled: boolean;
}) {
	const { fields, unsupportedRequired } = useMemo(
		() => elicitationSchema(request),
		[request],
	);
	const [values, setValues] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const complete =
		fields.every((field) => {
			const value = values[field.name]?.trim() ?? "";
			if (field.required && !value) return false;
			if (
				value &&
				field.allowedValues?.length &&
				!field.allowedValues.includes(value)
			) {
				return false;
			}
			if (value && field.type === "number" && !Number.isFinite(Number(value))) {
				return false;
			}
			if (
				value &&
				field.type === "boolean" &&
				!["true", "false"].includes(value.toLowerCase())
			) {
				return false;
			}
			return true;
		}) && unsupportedRequired.length === 0;
	const respond = async (response: ElicitationResult) => {
		setBusy(true);
		try {
			await onRespond(response);
		} finally {
			setBusy(false);
		}
	};
	const content = Object.fromEntries(
		fields
			.filter((field) => values[field.name] !== undefined)
			.map((field) => {
				const value = values[field.name] ?? "";
				if (field.type === "number") return [field.name, Number(value)];
				if (field.type === "boolean") {
					return [field.name, value.trim().toLowerCase() === "true"];
				}
				if (field.type === "string[]") {
					return [
						field.name,
						value
							.split(",")
							.map((entry) => entry.trim())
							.filter(Boolean),
					];
				}
				return [field.name, value];
			}),
	);

	return (
		<ActionCard
			description={request.description ?? request.message}
			title={request.title ?? request.displayName ?? request.serverName}
		>
			{request.mode === "url" && request.url ? (
				<Button
					disabled={busy || disabled}
					onPress={() => void Linking.openURL(request.url ?? "")}
					size="sm"
					variant="secondary"
				>
					<Text>Open authorization page</Text>
				</Button>
			) : null}
			{fields.map((field) => (
				<View className="gap-1" key={field.name}>
					<Text className="text-muted-foreground text-xs">
						{field.title}
						{field.required ? " *" : ""}
					</Text>
					<Input
						editable={!busy && !disabled}
						keyboardType={field.type === "number" ? "numeric" : "default"}
						onChangeText={(value) =>
							setValues((current) => ({ ...current, [field.name]: value }))
						}
						placeholder={
							field.allowedValues?.length
								? field.allowedValues.join(" or ")
								: field.type === "boolean"
									? "true or false"
									: field.type === "string[]"
										? "Comma-separated values"
										: undefined
						}
						value={values[field.name] ?? ""}
					/>
				</View>
			))}
			{unsupportedRequired.length ? (
				<Text className="text-destructive text-xs">
					This form contains unsupported required fields (
					{unsupportedRequired.join(", ")}). Decline or cancel this request
					instead of submitting incomplete data.
				</Text>
			) : null}
			<View className="flex-row justify-end gap-2">
				<Button
					disabled={busy || disabled}
					onPress={() => void respond({ action: "cancel" })}
					size="sm"
					variant="ghost"
				>
					<Text>Cancel</Text>
				</Button>
				<Button
					disabled={busy || disabled}
					onPress={() => void respond({ action: "decline" })}
					size="sm"
					variant="outline"
				>
					<Text>Decline</Text>
				</Button>
				<Button
					disabled={busy || disabled || !complete}
					onPress={() =>
						void respond({
							action: "accept",
							...(fields.length ? { content } : {}),
						})
					}
					size="sm"
				>
					<Text>{request.mode === "url" ? "I've finished" : "Submit"}</Text>
				</Button>
			</View>
		</ActionCard>
	);
}

function ForwardCompatibleDialogCard({
	request,
	onCancel,
	disabled,
}: {
	request: PendingUserDialogRequest;
	onCancel: () => Promise<void>;
	disabled: boolean;
}) {
	const [busy, setBusy] = useState(false);
	return (
		<ActionCard
			description="This host has no renderer registered for this dialog kind."
			title={request.dialogKind}
		>
			<Button
				disabled={busy || disabled}
				onPress={() => {
					setBusy(true);
					void onCancel().finally(() => setBusy(false));
				}}
				size="sm"
				variant="outline"
			>
				<Text>Use default behavior</Text>
			</Button>
		</ActionCard>
	);
}

function ActionCard({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<View className="bg-card border-border gap-3 rounded-xl border px-4 py-3">
			<View className="gap-0.5">
				<Text className="font-medium text-sm">{title}</Text>
				{description ? (
					<Text className="text-muted-foreground text-xs">{description}</Text>
				) : null}
			</View>
			{children}
		</View>
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
