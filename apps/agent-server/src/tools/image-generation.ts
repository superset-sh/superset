import { tool } from "ai";
import { z } from "zod";
import { supabase } from "../lib/supabase";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_API_BASE = "https://api.openai.com/v1";

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
}

interface DallEResponse {
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
  }>;
  error?: { message: string };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Gemini API로 이미지 생성
 * base64 인코딩된 이미지 데이터를 반환합니다.
 */
async function generateImageWithGemini(
  prompt: string,
  model: string,
): Promise<{ data: string; mimeType: string }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 환경변수가 설정되지 않았습니다");
  }

  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 오류 (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as GeminiResponse;
  const parts = result.candidates?.[0]?.content?.parts;
  if (!parts) {
    throw new Error("Gemini API에서 이미지를 생성하지 못했습니다");
  }

  const imagePart = parts.find((part) => part.inline_data);

  if (!imagePart?.inline_data) {
    const textPart = parts.find((part) => part.text);
    throw new Error(
      `이미지 생성 실패: ${textPart?.text ?? "알 수 없는 응답"}`,
    );
  }

  return {
    data: imagePart.inline_data.data,
    mimeType: imagePart.inline_data.mime_type,
  };
}

/**
 * OpenAI DALL-E 3 API로 이미지 생성
 * base64 인코딩된 이미지 데이터를 반환합니다.
 */
async function generateImageWithDallE(
  prompt: string,
  size: string,
  quality: string,
  style: string,
): Promise<{ data: string; mimeType: string; revisedPrompt?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 환경변수가 설정되지 않았습니다");
  }

  const response = await fetch(`${OPENAI_API_BASE}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size,
      quality,
      style,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DALL-E API 오류 (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as DallEResponse;

  if (result.error) {
    throw new Error(`DALL-E API 오류: ${result.error.message}`);
  }

  const imageData = result.data?.[0]?.b64_json;
  if (!imageData) {
    throw new Error("DALL-E API에서 이미지를 생성하지 못했습니다");
  }

  return {
    data: imageData,
    mimeType: "image/png",
    revisedPrompt: result.data?.[0]?.revised_prompt,
  };
}

/**
 * base64 이미지를 Supabase Storage에 업로드
 */
async function uploadToStorage(
  base64Data: string,
  mimeType: string,
): Promise<string> {
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const fileName = `marketing/generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = Buffer.from(base64Data, "base64");

  const { error } = await supabase.storage
    .from("files")
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase Storage 업로드 실패: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("files")
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// ============================================================================
// Tools
// ============================================================================

export const imageGenerationTools = {
  /**
   * AI 이미지 생성 (DALL-E 3 / Gemini)
   */
  "image.generate": tool({
    description:
      "AI 이미지 생성. 텍스트 프롬프트를 기반으로 이미지를 생성합니다. DALL-E 3 (기본, 고품질) 또는 Google Gemini를 선택할 수 있습니다.",
    parameters: z.object({
      prompt: z.string().describe("이미지 생성을 위한 텍스트 프롬프트"),
      model: z
        .enum(["dall-e-3", "gemini-2.5-flash-image", "gemini-3-pro-image-preview"])
        .default("dall-e-3")
        .describe("이미지 생성 모델. dall-e-3(기본, 고품질), gemini-2.5-flash-image, gemini-3-pro-image-preview"),
      style: z
        .string()
        .optional()
        .describe("이미지 스타일 힌트 (예: photorealistic, illustration, watercolor). DALL-E는 vivid/natural도 지원"),
      size: z
        .enum(["1024x1024", "1792x1024", "1024x1792"])
        .default("1024x1024")
        .optional()
        .describe("이미지 크기 (DALL-E 3 전용). 1024x1024(정사각형), 1792x1024(가로), 1024x1792(세로)"),
      quality: z
        .enum(["standard", "hd"])
        .default("standard")
        .optional()
        .describe("이미지 품질 (DALL-E 3 전용). hd는 더 세밀한 디테일"),
    }),
    execute: async ({ prompt, model, style, size, quality }) => {
      try {
        const fullPrompt = style
          ? `${prompt}\n\nStyle: ${style}`
          : prompt;

        let imageUrl: string;
        let mimeType: string;
        let revisedPrompt: string | undefined;

        if (model === "dall-e-3") {
          // DALL-E 3: style 파라미터 매핑 (vivid/natural)
          const dalleStyle = style === "natural" ? "natural" : "vivid";
          const result = await generateImageWithDallE(
            fullPrompt,
            size ?? "1024x1024",
            quality ?? "standard",
            dalleStyle,
          );
          imageUrl = await uploadToStorage(result.data, result.mimeType);
          mimeType = result.mimeType;
          revisedPrompt = result.revisedPrompt;
        } else {
          // Gemini
          const result = await generateImageWithGemini(fullPrompt, model);
          imageUrl = await uploadToStorage(result.data, result.mimeType);
          mimeType = result.mimeType;
        }

        return {
          success: true as const,
          imageUrl,
          model,
          prompt: fullPrompt,
          mimeType,
          ...(revisedPrompt ? { revisedPrompt } : {}),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        return {
          success: false as const,
          imageUrl: null,
          model,
          prompt,
          error: message,
        };
      }
    },
  }),

  /**
   * 이미지 편집/변형 (Gemini 멀티모달 — 기존 이미지 + 텍스트 프롬프트)
   */
  "image.edit": tool({
    description:
      "기존 이미지를 편집합니다. 원본 이미지 URL과 편집 지시를 텍스트로 제공하면 수정된 이미지를 생성합니다.",
    parameters: z.object({
      sourceImageUrl: z.string().url().describe("원본 이미지 URL"),
      editPrompt: z.string().describe("이미지 편집 지시 (예: 배경을 파란색으로 변경)"),
      model: z
        .enum(["gemini-2.5-flash-image", "gemini-3-pro-image-preview"])
        .default("gemini-2.5-flash-image")
        .describe("Gemini 이미지 편집 모델"),
    }),
    execute: async ({ sourceImageUrl, editPrompt, model }) => {
      try {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!apiKey) {
          throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 환경변수가 설정되지 않았습니다");
        }

        // 원본 이미지 다운로드 → base64 변환
        const imageResponse = await fetch(sourceImageUrl);
        if (!imageResponse.ok) {
          throw new Error(`이미지 다운로드 실패: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString("base64");
        const sourceMimeType = imageResponse.headers.get("content-type") ?? "image/png";

        // Gemini 멀티모달 요청 (이미지 + 텍스트)
        const response = await fetch(
          `${GEMINI_API_BASE}/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inline_data: {
                        mime_type: sourceMimeType,
                        data: imageBase64,
                      },
                    },
                    { text: editPrompt },
                  ],
                },
              ],
              generationConfig: {
                responseModalities: ["TEXT", "IMAGE"],
              },
            }),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API 오류 (${response.status}): ${errorText}`);
        }

        const result = (await response.json()) as GeminiResponse;
        const parts = result.candidates?.[0]?.content?.parts;
        const imagePart = parts?.find((part) => part.inline_data);

        if (!imagePart?.inline_data) {
          throw new Error("이미지 편집 결과를 받지 못했습니다");
        }

        const imageUrl = await uploadToStorage(
          imagePart.inline_data.data,
          imagePart.inline_data.mime_type,
        );

        return {
          success: true as const,
          imageUrl,
          model,
          editPrompt,
          sourceImageUrl,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        return {
          success: false as const,
          imageUrl: null,
          model,
          editPrompt,
          sourceImageUrl,
          error: message,
        };
      }
    },
  }),
};
