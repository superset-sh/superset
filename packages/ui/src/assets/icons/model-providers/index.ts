import lobeAnthropicIcon from "./lobe/anthropic.svg";
import lobeClaudeColorIcon from "./lobe/claude-color.svg";
import lobeCodexIcon from "./lobe/codex.svg";
import lobeCohereColorIcon from "./lobe/cohere-color.svg";
import lobeDeepseekColorIcon from "./lobe/deepseek-color.svg";
import lobeGeminiColorIcon from "./lobe/gemini-color.svg";
import lobeGoogleColorIcon from "./lobe/google-color.svg";
import lobeKimiColorIcon from "./lobe/kimi-color.svg";
import lobeMetaIcon from "./lobe/meta.svg";
import lobeMistralColorIcon from "./lobe/mistral-color.svg";
import lobeOllamaIcon from "./lobe/ollama.svg";
import lobeOpenaiIcon from "./lobe/openai.svg";
import lobeOpenrouterIcon from "./lobe/openrouter.svg";
import lobePerplexityIcon from "./lobe/perplexity.svg";
import lobeQwenColorIcon from "./lobe/qwen-color.svg";
import lobeXaiIcon from "./lobe/xai.svg";
import lobeZhipuColorIcon from "./lobe/zhipu-color.svg";
import modelsDevAihubmixIcon from "./models-dev/aihubmix.svg";
import modelsDevAlibabaIcon from "./models-dev/alibaba.svg";
import modelsDevAlibabaCnIcon from "./models-dev/alibaba-cn.svg";
import modelsDevAmazonBedrockIcon from "./models-dev/amazon-bedrock.svg";
import modelsDevAzureIcon from "./models-dev/azure.svg";
import modelsDevBasetenIcon from "./models-dev/baseten.svg";
import modelsDevCerebrasIcon from "./models-dev/cerebras.svg";
import modelsDevChutesIcon from "./models-dev/chutes.svg";
import modelsDevCloudflareWorkersAiIcon from "./models-dev/cloudflare-workers-ai.svg";
import modelsDevCortecsIcon from "./models-dev/cortecs.svg";
import modelsDevDeepinfraIcon from "./models-dev/deepinfra.svg";
import modelsDevDeepseekIcon from "./models-dev/deepseek.svg";
import modelsDevFastrouterIcon from "./models-dev/fastrouter.svg";
import modelsDevFireworksAiIcon from "./models-dev/fireworks-ai.svg";
import modelsDevGithubCopilotIcon from "./models-dev/github-copilot.svg";
import modelsDevGithubModelsIcon from "./models-dev/github-models.svg";
import modelsDevGoogleIcon from "./models-dev/google.svg";
import modelsDevGoogleVertexIcon from "./models-dev/google-vertex.svg";
import modelsDevGoogleVertexAnthropicIcon from "./models-dev/google-vertex-anthropic.svg";
import modelsDevGroqIcon from "./models-dev/groq.svg";
import modelsDevHuggingfaceIcon from "./models-dev/huggingface.svg";
import modelsDevIflowcnIcon from "./models-dev/iflowcn.svg";
import modelsDevInceptionIcon from "./models-dev/inception.svg";
import modelsDevInferenceIcon from "./models-dev/inference.svg";
import modelsDevLlamaIcon from "./models-dev/llama.svg";
import modelsDevLmstudioIcon from "./models-dev/lmstudio.svg";
import modelsDevLucidqueryIcon from "./models-dev/lucidquery.svg";
import modelsDevMistralIcon from "./models-dev/mistral.svg";
import modelsDevModelscopeIcon from "./models-dev/modelscope.svg";
import modelsDevMoonshotaiIcon from "./models-dev/moonshotai.svg";
import modelsDevMoonshotaiCnIcon from "./models-dev/moonshotai-cn.svg";
import modelsDevMorphIcon from "./models-dev/morph.svg";
import modelsDevNebiusIcon from "./models-dev/nebius.svg";
import modelsDevNvidiaIcon from "./models-dev/nvidia.svg";
import modelsDevOpenaiIcon from "./models-dev/openai.svg";
import modelsDevOpencodeIcon from "./models-dev/opencode.svg";
import modelsDevOpenrouterIcon from "./models-dev/openrouter.svg";
import modelsDevPerplexityIcon from "./models-dev/perplexity.svg";
import modelsDevRequestyIcon from "./models-dev/requesty.svg";
import modelsDevScalewayIcon from "./models-dev/scaleway.svg";
import modelsDevSubmodelIcon from "./models-dev/submodel.svg";
import modelsDevSyntheticIcon from "./models-dev/synthetic.svg";
import modelsDevTogetheraiIcon from "./models-dev/togetherai.svg";
import modelsDevUpstageIcon from "./models-dev/upstage.svg";
import modelsDevV0Icon from "./models-dev/v0.svg";
import modelsDevVeniceIcon from "./models-dev/venice.svg";
import modelsDevVercelIcon from "./models-dev/vercel.svg";
import modelsDevVultrIcon from "./models-dev/vultr.svg";
import modelsDevWandbIcon from "./models-dev/wandb.svg";
import modelsDevXaiIcon from "./models-dev/xai.svg";
import modelsDevZaiIcon from "./models-dev/zai.svg";
import modelsDevZaiCodingPlanIcon from "./models-dev/zai-coding-plan.svg";
import modelsDevZenmuxIcon from "./models-dev/zenmux.svg";
import modelsDevZhipuaiIcon from "./models-dev/zhipuai.svg";
import modelsDevZhipuaiCodingPlanIcon from "./models-dev/zhipuai-coding-plan.svg";

export type LocalModelProviderIconVariant = "mono" | "color";

export interface LocalModelProviderIcon {
	src: string;
	variant: LocalModelProviderIconVariant;
}

export const LOCAL_LOBE_MODEL_PROVIDER_ICONS: Record<
	string,
	LocalModelProviderIcon
> = {
	anthropic: { src: lobeAnthropicIcon, variant: "mono" },
	"claude-color": { src: lobeClaudeColorIcon, variant: "color" },
	codex: { src: lobeCodexIcon, variant: "mono" },
	"cohere-color": { src: lobeCohereColorIcon, variant: "color" },
	"deepseek-color": { src: lobeDeepseekColorIcon, variant: "color" },
	"gemini-color": { src: lobeGeminiColorIcon, variant: "color" },
	"google-color": { src: lobeGoogleColorIcon, variant: "color" },
	"kimi-color": { src: lobeKimiColorIcon, variant: "color" },
	meta: { src: lobeMetaIcon, variant: "mono" },
	"mistral-color": { src: lobeMistralColorIcon, variant: "color" },
	ollama: { src: lobeOllamaIcon, variant: "mono" },
	openai: { src: lobeOpenaiIcon, variant: "mono" },
	openrouter: { src: lobeOpenrouterIcon, variant: "mono" },
	perplexity: { src: lobePerplexityIcon, variant: "mono" },
	"qwen-color": { src: lobeQwenColorIcon, variant: "color" },
	xai: { src: lobeXaiIcon, variant: "mono" },
	"zhipu-color": { src: lobeZhipuColorIcon, variant: "color" },
};

export const LOCAL_MODELS_DEV_PROVIDER_LOGOS: Record<string, string> = {
	aihubmix: modelsDevAihubmixIcon,
	"alibaba-cn": modelsDevAlibabaCnIcon,
	alibaba: modelsDevAlibabaIcon,
	"amazon-bedrock": modelsDevAmazonBedrockIcon,
	azure: modelsDevAzureIcon,
	baseten: modelsDevBasetenIcon,
	cerebras: modelsDevCerebrasIcon,
	chutes: modelsDevChutesIcon,
	"cloudflare-workers-ai": modelsDevCloudflareWorkersAiIcon,
	cortecs: modelsDevCortecsIcon,
	deepinfra: modelsDevDeepinfraIcon,
	deepseek: modelsDevDeepseekIcon,
	fastrouter: modelsDevFastrouterIcon,
	"fireworks-ai": modelsDevFireworksAiIcon,
	"github-copilot": modelsDevGithubCopilotIcon,
	"github-models": modelsDevGithubModelsIcon,
	"google-vertex-anthropic": modelsDevGoogleVertexAnthropicIcon,
	"google-vertex": modelsDevGoogleVertexIcon,
	google: modelsDevGoogleIcon,
	groq: modelsDevGroqIcon,
	huggingface: modelsDevHuggingfaceIcon,
	iflowcn: modelsDevIflowcnIcon,
	inception: modelsDevInceptionIcon,
	inference: modelsDevInferenceIcon,
	llama: modelsDevLlamaIcon,
	lmstudio: modelsDevLmstudioIcon,
	lucidquery: modelsDevLucidqueryIcon,
	mistral: modelsDevMistralIcon,
	modelscope: modelsDevModelscopeIcon,
	"moonshotai-cn": modelsDevMoonshotaiCnIcon,
	moonshotai: modelsDevMoonshotaiIcon,
	morph: modelsDevMorphIcon,
	nebius: modelsDevNebiusIcon,
	nvidia: modelsDevNvidiaIcon,
	openai: modelsDevOpenaiIcon,
	opencode: modelsDevOpencodeIcon,
	openrouter: modelsDevOpenrouterIcon,
	perplexity: modelsDevPerplexityIcon,
	requesty: modelsDevRequestyIcon,
	scaleway: modelsDevScalewayIcon,
	submodel: modelsDevSubmodelIcon,
	synthetic: modelsDevSyntheticIcon,
	togetherai: modelsDevTogetheraiIcon,
	upstage: modelsDevUpstageIcon,
	v0: modelsDevV0Icon,
	venice: modelsDevVeniceIcon,
	vercel: modelsDevVercelIcon,
	vultr: modelsDevVultrIcon,
	wandb: modelsDevWandbIcon,
	xai: modelsDevXaiIcon,
	"zai-coding-plan": modelsDevZaiCodingPlanIcon,
	zai: modelsDevZaiIcon,
	zenmux: modelsDevZenmuxIcon,
	"zhipuai-coding-plan": modelsDevZhipuaiCodingPlanIcon,
	zhipuai: modelsDevZhipuaiIcon,
};

export function getLocalLobeModelProviderIcon(args: {
	id: string;
	variant: LocalModelProviderIconVariant;
}): LocalModelProviderIcon | null {
	const key = args.variant === "color" ? `${args.id}-color` : args.id;
	return LOCAL_LOBE_MODEL_PROVIDER_ICONS[key] ?? null;
}

export function getLocalModelSelectorLogo(provider: string): string | null {
	return (
		LOCAL_MODELS_DEV_PROVIDER_LOGOS[provider] ??
		LOCAL_LOBE_MODEL_PROVIDER_ICONS[provider]?.src ??
		null
	);
}
