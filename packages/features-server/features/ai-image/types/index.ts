import type { AiImageGeneration, AiImageStyleTemplate } from "@superbuilder/drizzle";

export type GenerationWithStyle = AiImageGeneration & {
  styleTemplate?: AiImageStyleTemplate | null;
};

export type GenerationStreamEvent = {
  status: "pending" | "generating" | "completed" | "failed";
  progress?: number;
  imageBase64?: string;
  errorMessage?: string;
};

export const AI_IMAGE_MODELS = [
  {
    id: "gemini-2.0-flash-exp-image-generation",
    label: "Gemini 2.0 Flash",
    description: "실험적 이미지 생성",
  },
  {
    id: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash",
    description: "빠르고 효율적",
  },
  {
    id: "gemini-3.1-flash-image-preview",
    label: "Gemini 3.1 Flash",
    description: "최신 프리뷰",
  },
  {
    id: "gemini-3-pro-image-preview",
    label: "Gemini 3 Pro",
    description: "고품질 프로",
  },
] as const;

export type AiImageModelId = (typeof AI_IMAGE_MODELS)[number]["id"];

export const DEFAULT_IMAGE_MODEL: AiImageModelId = "gemini-2.0-flash-exp-image-generation";

export const FORMAT_SIZE_MAP = {
  feed: { width: 1080, height: 1080, label: "Feed", ratio: "1:1" },
  carousel: { width: 1080, height: 1350, label: "Carousel", ratio: "4:5" },
  story: { width: 1080, height: 1920, label: "Story", ratio: "9:16" },
  reels_cover: { width: 1080, height: 1920, label: "Reels Cover", ratio: "9:16" },
} as const;

export type AiImageFormat = keyof typeof FORMAT_SIZE_MAP;
