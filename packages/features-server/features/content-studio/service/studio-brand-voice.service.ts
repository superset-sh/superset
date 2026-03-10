import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { DRIZZLE } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { eq, and, or } from "drizzle-orm";
import {
  studioStudios,
  studioBrandProfiles,
  studioTonePresets,
} from "@superbuilder/drizzle";
import type { StudioTonePreset } from "@superbuilder/drizzle";
import { LLMService } from "../../../features/ai";

@Injectable()
export class StudioBrandVoiceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llm: LLMService,
  ) {}

  // ========================================
  // Brand Profile CRUD
  // ========================================

  async getProfile(studioId: string, userId: string) {
    await this.assertStudioOwner(studioId, userId);

    const profile = await this.db
      .select()
      .from(studioBrandProfiles)
      .where(eq(studioBrandProfiles.studioId, studioId))
      .then((r) => r[0] ?? null);

    if (!profile) return null;

    let activePreset: StudioTonePreset | null = null;
    if (profile.activePresetId) {
      activePreset = await this.db
        .select()
        .from(studioTonePresets)
        .where(eq(studioTonePresets.id, profile.activePresetId))
        .then((r) => r[0] ?? null);
    }

    return { ...profile, activePreset };
  }

  async upsertProfile(
    studioId: string,
    input: {
      brandName: string;
      industry?: string | null;
      targetAudience?: string | null;
      formality?: number;
      friendliness?: number;
      humor?: number;
      sentenceLength?: "short" | "medium" | "long";
      forbiddenWords?: string[];
      requiredWords?: string[];
      additionalGuidelines?: string | null;
    },
    userId: string,
  ) {
    await this.assertStudioOwner(studioId, userId);

    const existing = await this.db
      .select()
      .from(studioBrandProfiles)
      .where(eq(studioBrandProfiles.studioId, studioId))
      .then((r) => r[0]);

    if (existing) {
      const [updated] = await this.db
        .update(studioBrandProfiles)
        .set(input)
        .where(eq(studioBrandProfiles.studioId, studioId))
        .returning();
      return updated!;
    }

    const [created] = await this.db
      .insert(studioBrandProfiles)
      .values({ studioId, ...input })
      .returning();
    return created!;
  }

  async deleteProfile(studioId: string, userId: string) {
    await this.assertStudioOwner(studioId, userId);

    await this.db
      .delete(studioBrandProfiles)
      .where(eq(studioBrandProfiles.studioId, studioId));

    return { success: true };
  }

  async setActivePreset(
    studioId: string,
    presetId: string | null,
    userId: string,
  ) {
    await this.assertStudioOwner(studioId, userId);

    const profile = await this.db
      .select()
      .from(studioBrandProfiles)
      .where(eq(studioBrandProfiles.studioId, studioId))
      .then((r) => r[0]);

    if (!profile)
      throw new NotFoundException("브랜드 프로필을 먼저 생성하세요");

    if (presetId) {
      const preset = await this.db
        .select()
        .from(studioTonePresets)
        .where(
          and(
            eq(studioTonePresets.id, presetId),
            or(
              eq(studioTonePresets.isSystem, true),
              eq(studioTonePresets.studioId, studioId),
            ),
          ),
        )
        .then((r) => r[0]);

      if (!preset) throw new NotFoundException("프리셋을 찾을 수 없습니다");
    }

    const [updated] = await this.db
      .update(studioBrandProfiles)
      .set({ activePresetId: presetId })
      .where(eq(studioBrandProfiles.studioId, studioId))
      .returning();

    return updated!;
  }

  // ========================================
  // Tone Presets CRUD
  // ========================================

  async listPresets(studioId: string, userId: string) {
    await this.assertStudioOwner(studioId, userId);

    return this.db
      .select()
      .from(studioTonePresets)
      .where(
        or(
          eq(studioTonePresets.isSystem, true),
          eq(studioTonePresets.studioId, studioId),
        ),
      )
      .orderBy(studioTonePresets.isSystem, studioTonePresets.createdAt);
  }

  async createPreset(
    studioId: string,
    input: {
      name: string;
      description?: string;
      formality: number;
      friendliness: number;
      humor: number;
      sentenceLength: "short" | "medium" | "long";
      systemPromptSuffix?: string;
    },
    userId: string,
  ) {
    await this.assertStudioOwner(studioId, userId);

    const existing = await this.db
      .select()
      .from(studioTonePresets)
      .where(
        and(
          eq(studioTonePresets.studioId, studioId),
          eq(studioTonePresets.name, input.name),
        ),
      )
      .then((r) => r[0]);

    if (existing)
      throw new ConflictException("이미 같은 이름의 프리셋이 있습니다");

    const [created] = await this.db
      .insert(studioTonePresets)
      .values({ studioId, isSystem: false, ...input })
      .returning();

    return created!;
  }

  async updatePreset(
    presetId: string,
    input: {
      name?: string;
      description?: string | null;
      formality?: number;
      friendliness?: number;
      humor?: number;
      sentenceLength?: "short" | "medium" | "long";
      systemPromptSuffix?: string | null;
    },
    userId: string,
  ) {
    const preset = await this.db
      .select()
      .from(studioTonePresets)
      .where(eq(studioTonePresets.id, presetId))
      .then((r) => r[0]);

    if (!preset) throw new NotFoundException("프리셋을 찾을 수 없습니다");
    if (preset.isSystem)
      throw new ForbiddenException("시스템 프리셋은 수정할 수 없습니다");

    await this.assertStudioOwner(preset.studioId!, userId);

    const [updated] = await this.db
      .update(studioTonePresets)
      .set(input)
      .where(eq(studioTonePresets.id, presetId))
      .returning();

    return updated!;
  }

  async deletePreset(presetId: string, userId: string) {
    const preset = await this.db
      .select()
      .from(studioTonePresets)
      .where(eq(studioTonePresets.id, presetId))
      .then((r) => r[0]);

    if (!preset) throw new NotFoundException("프리셋을 찾을 수 없습니다");
    if (preset.isSystem)
      throw new ForbiddenException("시스템 프리셋은 삭제할 수 없습니다");

    await this.assertStudioOwner(preset.studioId!, userId);

    // 활성 프리셋으로 설정되어 있으면 null로 리셋
    await this.db
      .update(studioBrandProfiles)
      .set({ activePresetId: null })
      .where(eq(studioBrandProfiles.activePresetId, presetId));

    await this.db
      .delete(studioTonePresets)
      .where(eq(studioTonePresets.id, presetId));

    return { success: true };
  }

  // ========================================
  // AI - 금칙어 대체어 추천
  // ========================================

  async suggestAlternatives(
    studioId: string,
    word: string,
    context: string,
    userId: string,
  ): Promise<string[]> {
    await this.assertStudioOwner(studioId, userId);

    const raw = await this.llm.chatCompletion(
      [
        {
          role: "system",
          content: `당신은 한국어 카피라이팅 전문가입니다.
사용자가 제시한 금칙어에 대해 문맥에 맞는 대체어 3~5개를 추천합니다.
응답은 반드시 JSON 형식으로:
{ "alternatives": ["대체어1", "대체어2", "대체어3"] }`,
        },
        {
          role: "user",
          content: `금칙어: "${word}"
문맥: "${context}"
이 금칙어를 대체할 수 있는 자연스러운 단어/표현을 추천해주세요.`,
        },
      ],
      { jsonMode: true },
    );

    try {
      const parsed = JSON.parse(raw);
      return (parsed.alternatives ?? []) as string[];
    } catch {
      return [];
    }
  }

  // ========================================
  // Brand Context Builder (AI 주입용)
  // ========================================

  async buildBrandContext(studioId: string): Promise<string | null> {
    const profile = await this.db
      .select()
      .from(studioBrandProfiles)
      .where(eq(studioBrandProfiles.studioId, studioId))
      .then((r) => r[0]);

    if (!profile) return null;

    let tone = {
      formality: profile.formality,
      friendliness: profile.friendliness,
      humor: profile.humor,
      sentenceLength: profile.sentenceLength,
    };

    if (profile.activePresetId) {
      const preset = await this.db
        .select()
        .from(studioTonePresets)
        .where(eq(studioTonePresets.id, profile.activePresetId))
        .then((r) => r[0]);

      if (preset) {
        tone = {
          formality: preset.formality,
          friendliness: preset.friendliness,
          humor: preset.humor,
          sentenceLength: preset.sentenceLength,
        };
      }
    }

    const formalityLabel = ["반말체", "구어체", "보통체", "존댓말", "격식체"][tone.formality - 1] ?? "보통체";
    const friendlinessLabel = ["매우 딱딱한", "딱딱한", "보통", "친근한", "매우 친근한"][tone.friendliness - 1] ?? "보통";
    const humorLabel = ["매우 진지한", "진지한", "보통", "가벼운", "유머러스한"][tone.humor - 1] ?? "보통";
    const lengthLabel = { short: "짧고 간결한", medium: "보통 길이의", long: "상세하고 긴" }[tone.sentenceLength] ?? "보통 길이의";

    let ctx = `\n\n[브랜드 보이스 가이드]\n- 브랜드: ${profile.brandName}`;
    if (profile.industry) ctx += `\n- 산업군: ${profile.industry}`;
    if (profile.targetAudience) ctx += `\n- 타겟 고객: ${profile.targetAudience}`;
    ctx += `\n- 문체: ${formalityLabel}, ${friendlinessLabel} 어조, ${humorLabel} 톤`;
    ctx += `\n- 문장 길이: ${lengthLabel} 문장 선호`;

    if (profile.forbiddenWords && profile.forbiddenWords.length > 0) {
      ctx += `\n- 금칙어 (절대 사용 금지): ${profile.forbiddenWords.join(", ")}`;
    }
    if (profile.requiredWords && profile.requiredWords.length > 0) {
      ctx += `\n- 필수 키워드 (자연스럽게 포함): ${profile.requiredWords.join(", ")}`;
    }
    if (profile.additionalGuidelines) {
      ctx += `\n- 추가 가이드라인: ${profile.additionalGuidelines}`;
    }

    return ctx;
  }

  // ========================================
  // Helpers
  // ========================================

  private async assertStudioOwner(studioId: string, userId: string) {
    const studio = await this.db
      .select({ ownerId: studioStudios.ownerId })
      .from(studioStudios)
      .where(
        and(eq(studioStudios.id, studioId), eq(studioStudios.isDeleted, false)),
      )
      .then((r) => r[0]);

    if (!studio) throw new NotFoundException("스튜디오를 찾을 수 없습니다");
    if (studio.ownerId !== userId)
      throw new ForbiddenException("소유자만 수정할 수 있습니다");
  }
}
