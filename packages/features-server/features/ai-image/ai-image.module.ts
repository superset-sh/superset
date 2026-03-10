import { Module, type OnModuleInit } from "@nestjs/common";
import { AiImageService } from "./generation/ai-image.service";
import { StyleTemplateService } from "./generation/style-template.service";
import { ContentThemeService } from "./content-theme/content-theme.service";
import { AiImageController, AiImageAdminController } from "./controller";
import { injectAiImageService, injectStyleTemplateService, injectContentThemeService } from "./trpc";
import { AIModule } from "../../features/ai";

@Module({
  imports: [AIModule],
  controllers: [AiImageController, AiImageAdminController],
  providers: [AiImageService, StyleTemplateService, ContentThemeService],
  exports: [AiImageService, StyleTemplateService, ContentThemeService],
})
export class AiImageModule implements OnModuleInit {
  constructor(
    private readonly aiImageService: AiImageService,
    private readonly styleTemplateService: StyleTemplateService,
    private readonly contentThemeService: ContentThemeService,
  ) {}

  onModuleInit() {
    injectAiImageService(this.aiImageService);
    injectStyleTemplateService(this.styleTemplateService);
    injectContentThemeService(this.contentThemeService);
  }
}
