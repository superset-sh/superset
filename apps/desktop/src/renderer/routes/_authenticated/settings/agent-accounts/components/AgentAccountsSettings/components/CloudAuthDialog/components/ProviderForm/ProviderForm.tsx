import { Trans, useLingui } from "@lingui/react/macro";
import { gatewayBaseUrl } from "@superset/shared/agent-credentials";
import { cn } from "@superset/ui/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import type { CustomProvider } from "../../../../../../hooks/useAgentCredential";
import { FOCUS_RING } from "../../constants";
import { ExternalTextLink } from "../ExternalTextLink";
import { Field } from "../Field";
import { SaveButton } from "../SaveButton";
import { SavedSecret } from "../SavedSecret";
import { SecretField } from "../SecretField";

export function ProviderForm({
	agent,
	provider,
	saved,
	onSave,
	checking,
}: {
	agent: string;
	provider: CustomProvider;
	saved: boolean;
	onSave: (value: string, baseUrl: string) => void;
	checking: boolean;
}) {
	const { t } = useLingui();
	const advancedId = useId();
	const [advanced, setAdvanced] = useState(false);
	const [replacing, setReplacing] = useState(false);
	const [draft, setDraft] = useState("");
	const defaultBaseUrl = gatewayBaseUrl(agent) ?? "";
	const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
	const filled = draft.trim().length > 0 && baseUrl.trim().length > 0;
	if (provider !== "gateway") return null;
	if (saved && !replacing) {
		return (
			<SavedSecret
				label={t({ message: "API key" })}
				onReplace={() => setReplacing(true)}
			/>
		);
	}
	return (
		<>
			<ExternalTextLink href="https://vercel.com/ai-gateway">
				<Trans>Get an API key</Trans>
			</ExternalTextLink>
			<button
				aria-controls={advancedId}
				aria-expanded={advanced}
				className={cn(
					"flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground",
					FOCUS_RING,
				)}
				onClick={() => setAdvanced((value) => !value)}
				type="button"
			>
				{advanced ? (
					<ChevronDown className="size-4" />
				) : (
					<ChevronRight className="size-4" />
				)}
				<Trans>Advanced</Trans>
			</button>
			{advanced ? (
				<div id={advancedId}>
					<Field
						label={t({ message: "Base URL" })}
						onChange={setBaseUrl}
						placeholder={defaultBaseUrl}
						value={baseUrl}
					/>
				</div>
			) : null}
			<div className="flex items-center gap-2">
				<SecretField
					className="flex-1"
					hideLabel
					label={t({ message: "API key" })}
					onChange={setDraft}
					placeholder="AI_GATEWAY_API_KEY"
					value={draft}
				/>
				<SaveButton
					checking={checking}
					disabled={!filled}
					onClick={() => onSave(draft.trim(), baseUrl.trim())}
				/>
			</div>
		</>
	);
}
