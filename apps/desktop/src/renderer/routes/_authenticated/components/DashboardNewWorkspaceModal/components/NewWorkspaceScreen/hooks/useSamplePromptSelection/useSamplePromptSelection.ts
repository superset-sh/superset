import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	type SamplePrompt,
	type SamplePromptTier,
	selectSamplePrompts,
} from "../../components/SamplePrompts/constants";

interface SamplePromptSelection {
	prompts: SamplePrompt[];
	/**
	 * The setup verdict has not landed yet. Every arm holds on this together —
	 * rendering rows immediately while cards waited would make the suggestion
	 * surface appear at different times per arm, which is a timing difference
	 * the experiment would read as a form-factor effect.
	 */
	isPending: boolean;
}

/**
 * Picks the prompts every arm shows. Selection lives here rather than in each
 * layout so the arms can only differ in form factor: same pool, same order,
 * same setup-first rule, only `count` changes.
 */
export function useSamplePromptSelection(
	tier: SamplePromptTier,
	hostUrl: string | null,
	projectId: string | null,
	count: number,
): SamplePromptSelection {
	const canCheckSetup = Boolean(hostUrl && projectId);

	// Same query the v2 sidebar setup card uses.
	const { data: needsSetupScripts, isPending } = useQuery({
		queryKey: ["host-config", "shouldShowSetupCard", hostUrl, projectId],
		queryFn: () =>
			hostUrl && projectId
				? getHostServiceClientByUrl(hostUrl).config.shouldShowSetupCard.query({
						projectId,
					})
				: false,
		enabled: canCheckSetup,
	});

	if (canCheckSetup && isPending) return { prompts: [], isPending: true };

	return {
		prompts: selectSamplePrompts(tier, needsSetupScripts === true, count),
		isPending: false,
	};
}
