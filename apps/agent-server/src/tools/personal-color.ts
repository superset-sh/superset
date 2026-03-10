import { tool } from "ai";
import { z } from "zod";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
}

interface PersonalColorResult {
  season: "spring_warm" | "summer_cool" | "autumn_warm" | "winter_cool";
  seasonLabel: string;
  confidence: number;
  analysis: {
    skinTone: string;
    undertone: "warm" | "cool" | "neutral";
    features: string;
  };
  palette: {
    primary: string[];
    accent: string[];
    neutral: string[];
    avoid: string[];
  };
  recommendation: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 이미지 URL을 다운로드하여 base64로 변환
 */
async function downloadImageAsBase64(
  imageUrl: string,
): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`이미지 다운로드 실패: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = response.headers.get("content-type") ?? "image/jpeg";

  return { data: base64, mimeType };
}

/**
 * Gemini Vision API로 퍼스널 컬러 분석
 */
async function analyzePersonalColor(
  imageBase64: string,
  mimeType: string,
): Promise<PersonalColorResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 환경변수가 설정되지 않았습니다");
  }

  const prompt = `당신은 전문 퍼스널 컬러 분석가입니다. 제공된 인물 사진을 분석하여 퍼스널 컬러를 진단해주세요.

다음 항목을 분석하세요:
1. 피부톤: 밝기, 채도, 전반적인 톤 설명
2. 언더톤: warm(황색 기반), cool(분홍/청색 기반), neutral(중간) 중 판별
3. 눈 색상, 머리카락 색상, 전체적인 외모 특징
4. 4계절 퍼스널 컬러 분류: spring_warm(봄 웜), summer_cool(여름 쿨), autumn_warm(가을 웜), winter_cool(겨울 쿨)
5. 어울리는 컬러 팔레트 (HEX 코드)
6. 스타일링 추천

다음 JSON 형식으로만 응답하세요:
{
  "season": "spring_warm | summer_cool | autumn_warm | winter_cool",
  "seasonLabel": "한국어 계절 라벨 (예: 봄 웜톤)",
  "confidence": 0.0~1.0 사이의 확신도,
  "analysis": {
    "skinTone": "피부톤 상세 설명",
    "undertone": "warm | cool | neutral",
    "features": "눈 색상, 머리카락 색상, 전체적 특징 설명"
  },
  "palette": {
    "primary": ["#HEX1", "#HEX2", "#HEX3"],
    "accent": ["#HEX1", "#HEX2"],
    "neutral": ["#HEX1", "#HEX2", "#HEX3"],
    "avoid": ["#HEX1", "#HEX2", "#HEX3"]
  },
  "recommendation": "메이크업, 의상, 액세서리 등 전반적 스타일링 추천"
}`;

  const response = await fetch(
    `${GEMINI_API_BASE}/gemini-2.5-flash:generateContent`,
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
                  mime_type: mimeType,
                  data: imageBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
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

  if (!parts) {
    throw new Error("Gemini API에서 분석 결과를 받지 못했습니다");
  }

  const textPart = parts.find((part) => part.text);
  if (!textPart?.text) {
    throw new Error("Gemini API에서 텍스트 응답을 받지 못했습니다");
  }

  const parsed = JSON.parse(textPart.text) as PersonalColorResult;
  return parsed;
}

// ============================================================================
// Tools
// ============================================================================

export const personalColorTools = {
  /**
   * 퍼스널 컬러 분석 — 인물 사진을 기반으로 퍼스널 컬러를 진단합니다.
   */
  "personal_color.analyze": tool({
    description:
      "퍼스널 컬러 분석. 인물 사진 URL을 제공하면 피부톤, 언더톤, 계절 유형을 분석하고 어울리는 컬러 팔레트를 추천합니다.",
    parameters: z.object({
      imageUrl: z.string().url().describe("분석할 인물 사진 URL"),
    }),
    execute: async ({ imageUrl }) => {
      try {
        // 이미지 다운로드 및 base64 변환
        const { data: imageBase64, mimeType } =
          await downloadImageAsBase64(imageUrl);

        // Gemini Vision API로 퍼스널 컬러 분석
        const analysisResult = await analyzePersonalColor(imageBase64, mimeType);

        return {
          success: true as const,
          imageUrl,
          ...analysisResult,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        return {
          success: false as const,
          error: message,
        };
      }
    },
  }),
};
