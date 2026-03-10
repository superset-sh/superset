import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { aiImageGenerations, aiImageStyleTemplates } from "@superbuilder/drizzle";
import { eq, and, desc, count } from "drizzle-orm";
import { createLogger } from "../../../core/logger";
import { Subject } from "rxjs";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { DEFAULT_IMAGE_MODEL, FORMAT_SIZE_MAP } from "../types";
import type { GenerationStreamEvent, AiImageFormat } from "../types";
import { ContentThemeService } from "../content-theme/content-theme.service";

const logger = createLogger("ai-image");

@Injectable()
export class AiImageService {
  private readonly streams = new Map<
    string,
    Subject<GenerationStreamEvent>
  >();

  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly contentThemeService: ContentThemeService,
  ) {}

  async generate(
    input: {
      prompt: string;
      model?: string;
      format?: AiImageFormat;
      styleTemplateId?: string;
      contentThemeId?: string;
      themeVariables?: Record<string, string>;
      inputImageBase64?: string;
    },
    userId: string,
  ) {
    const format: AiImageFormat = input.format ?? "feed";
    const { width, height } = FORMAT_SIZE_MAP[format];
    let finalPrompt = input.prompt;

    // Apply content theme prompt template
    if (input.contentThemeId) {
      const theme = await this.contentThemeService.findById(input.contentThemeId);
      const resolvedPrompt = this.contentThemeService.resolveThemePrompt(
        theme.promptTemplate,
        input.themeVariables,
      );
      finalPrompt = `${resolvedPrompt}. ${input.prompt}`;
    }

    // Apply style template suffix
    if (input.styleTemplateId) {
      const style = await this.db.query.aiImageStyleTemplates.findFirst({
        where: eq(aiImageStyleTemplates.id, input.styleTemplateId),
      });
      if (style) {
        finalPrompt = `${finalPrompt}. ${style.promptSuffix}`;
      }
    }

    // Create generation record
    const rows = await this.db
      .insert(aiImageGenerations)
      .values({
        userId,
        prompt: finalPrompt,
        format,
        styleTemplateId: input.styleTemplateId ?? null,
        contentThemeId: input.contentThemeId ?? null,
        inputImageUrl: null,
        width,
        height,
        status: "pending",
      })
      .returning();

    const generation = rows[0];
    if (!generation) {
      throw new BadRequestException("Failed to create generation record");
    }

    logger.info("Image generation started", {
      "ai_image.generation_id": generation.id,
      "user.id": userId,
      "ai_image.format": format,
      "ai_image.has_style": !!input.styleTemplateId,
      "ai_image.has_theme": !!input.contentThemeId,
      "ai_image.has_reference": !!input.inputImageBase64,
    });

    // Create stream subject BEFORE starting processing to avoid race condition
    const subject = new Subject<GenerationStreamEvent>();
    this.streams.set(generation.id, subject);

    // Start async generation
    this.processGeneration(
      generation.id,
      finalPrompt,
      input.model,
      input.inputImageBase64,
    );

    return { generationId: generation.id, status: "pending" as const };
  }

  createStream(generationId: string): Observable<MessageEvent> {
    // Use existing subject (created in generate()) or create new one
    let subject = this.streams.get(generationId);
    if (!subject) {
      subject = new Subject<GenerationStreamEvent>();
      this.streams.set(generationId, subject);
    }

    return subject.pipe(
      map(
        (event) =>
          ({
            data: JSON.stringify(event),
          }) as MessageEvent,
      ),
    );
  }

  private async processGeneration(
    generationId: string,
    prompt: string,
    model?: string,
    inputImageBase64?: string,
  ) {
    const subject = this.streams.get(generationId);
    const startTime = Date.now();

    try {
      // Update status to generating
      await this.db
        .update(aiImageGenerations)
        .set({ status: "generating" })
        .where(eq(aiImageGenerations.id, generationId));

      subject?.next({ status: "generating", progress: 10 });

      // Call Gemini API
      const imageBase64 = await this.callGeminiApi(
        prompt,
        model,
        inputImageBase64,
        (progress) => {
          subject?.next({ status: "generating", progress });
        },
      );

      // Upload to Supabase Storage (TODO: integrate with file-manager)
      const outputImageUrl = `generated/${generationId}.png`;

      // Update generation record
      const selectedModel = model ?? DEFAULT_IMAGE_MODEL;
      const durationMs = Date.now() - startTime;
      await this.db
        .update(aiImageGenerations)
        .set({
          status: "completed",
          outputImageUrl,
          metadata: { model: selectedModel, durationMs },
        })
        .where(eq(aiImageGenerations.id, generationId));

      subject?.next({ status: "completed", progress: 100, imageBase64 });

      logger.info("Image generation completed", {
        "ai_image.generation_id": generationId,
        "ai_image.duration_ms": durationMs,
        "ai_image.model": selectedModel,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await this.db
        .update(aiImageGenerations)
        .set({ status: "failed", errorMessage })
        .where(eq(aiImageGenerations.id, generationId));

      subject?.next({ status: "failed", errorMessage });

      logger.error("Image generation failed", {
        "ai_image.generation_id": generationId,
        "error.type":
          error instanceof Error ? error.constructor.name : "Unknown",
        "error.message": errorMessage,
      });
    } finally {
      subject?.complete();
      this.streams.delete(generationId);
    }
  }

  private async callGeminiApi(
    prompt: string,
    model?: string,
    inputImageBase64?: string,
    onProgress?: (progress: number) => void,
  ): Promise<string> {
    // Simulated progress updates
    onProgress?.(30);

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        throw new BadRequestException("GEMINI_API_KEY is not configured");
      }

      const ai = new GoogleGenAI({ apiKey });

      onProgress?.(50);

      const contents: Array<
        | string
        | { inlineData: { mimeType: string; data: string } }
      > = [prompt];

      if (inputImageBase64) {
        contents.push({
          inlineData: {
            mimeType: "image/png",
            data: inputImageBase64,
          },
        });
      }

      const response = await ai.models.generateContent({
        model: model ?? DEFAULT_IMAGE_MODEL,
        contents,
        config: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      });

      onProgress?.(90);

      // Extract image from response
      const candidates = response.candidates ?? [];
      for (const candidate of candidates) {
        for (const part of candidate.content?.parts ?? []) {
          if (part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data) {
            return part.inlineData.data;
          }
        }
      }

      throw new Error("No image generated in response");
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      const rawMessage =
        error instanceof Error ? error.message : String(error);

      // Parse structured API error for user-friendly message
      try {
        const parsed = JSON.parse(rawMessage);
        const code = parsed?.error?.code;
        if (code === 429) {
          throw new Error(
            "API 할당량이 초과되었습니다. 잠시 후 다시 시도하거나 유료 플랜을 확인하세요.",
          );
        }
        throw new Error(parsed?.error?.message ?? rawMessage);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== rawMessage) {
          throw parseError;
        }
        throw new Error(`Gemini API error: ${rawMessage}`);
      }
    }
  }

  async getResult(generationId: string) {
    const generation = await this.db.query.aiImageGenerations.findFirst({
      where: and(
        eq(aiImageGenerations.id, generationId),
        eq(aiImageGenerations.isDeleted, false),
      ),
    });

    if (!generation) {
      throw new NotFoundException(`Generation not found: ${generationId}`);
    }

    return generation;
  }

  async getHistory(userId: string, input: { page: number; limit: number }) {
    const { page, limit } = input;
    const offset = (page - 1) * limit;

    const whereCondition = and(
      eq(aiImageGenerations.userId, userId),
      eq(aiImageGenerations.isDeleted, false),
    );

    const [data, totalResult] = await Promise.all([
      this.db.query.aiImageGenerations.findMany({
        where: whereCondition,
        limit,
        offset,
        orderBy: [desc(aiImageGenerations.createdAt)],
      }),
      this.db
        .select({ count: count() })
        .from(aiImageGenerations)
        .where(whereCondition),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getReuse(id: string, userId: string) {
    const generation = await this.getResult(id);

    if (generation.userId !== userId) {
      throw new ForbiddenException("이 작업을 수행할 권한이 없습니다");
    }

    return {
      prompt: generation.prompt,
      format: generation.format,
      styleTemplateId: generation.styleTemplateId,
      contentThemeId: generation.contentThemeId,
    };
  }

  async delete(id: string, userId: string) {
    const generation = await this.getResult(id);

    if (generation.userId !== userId) {
      throw new ForbiddenException("이 작업을 수행할 권한이 없습니다");
    }

    await this.db
      .update(aiImageGenerations)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(aiImageGenerations.id, id));

    logger.info("Image generation deleted", {
      "ai_image.generation_id": id,
      "user.id": userId,
    });

    return { success: true };
  }

  async adminGetHistory(input: {
    page: number;
    limit: number;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { page, limit } = input;
    const offset = (page - 1) * limit;

    const conditions = [eq(aiImageGenerations.isDeleted, false)];

    if (input.userId) {
      conditions.push(eq(aiImageGenerations.userId, input.userId));
    }

    const whereCondition = and(...conditions);

    const [data, totalResult] = await Promise.all([
      this.db.query.aiImageGenerations.findMany({
        where: whereCondition,
        limit,
        offset,
        orderBy: [desc(aiImageGenerations.createdAt)],
      }),
      this.db
        .select({ count: count() })
        .from(aiImageGenerations)
        .where(whereCondition),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
