import { Module, type OnModuleInit } from "@nestjs/common";
import { ContentStudioService } from "./service/content-studio.service";
import { StudioAiSuggestService } from "./service/studio-ai-suggest.service";
import { StudioBrandVoiceService } from "./service/studio-brand-voice.service";
import { StudioSeoService } from "./service/studio-seo.service";
import { StudioRepurposeService } from "./service/studio-repurpose.service";
import { ContentStudioController } from "./controller";
import {
  injectContentStudioService,
  injectStudioAiSuggestService,
  injectStudioBrandVoiceService,
  injectStudioSeoService,
  injectStudioRepurposeService,
} from "./trpc";
import { AIModule } from "../../features/ai";

@Module({
  imports: [AIModule],
  controllers: [ContentStudioController],
  providers: [ContentStudioService, StudioAiSuggestService, StudioBrandVoiceService, StudioSeoService, StudioRepurposeService],
  exports: [ContentStudioService, StudioAiSuggestService, StudioBrandVoiceService, StudioSeoService, StudioRepurposeService],
})
export class ContentStudioModule implements OnModuleInit {
  constructor(
    private readonly service: ContentStudioService,
    private readonly aiSuggestService: StudioAiSuggestService,
    private readonly brandVoiceService: StudioBrandVoiceService,
    private readonly seoService: StudioSeoService,
    private readonly repurposeService: StudioRepurposeService,
  ) {}

  onModuleInit() {
    injectContentStudioService(this.service);
    injectStudioAiSuggestService(this.aiSuggestService);
    injectStudioBrandVoiceService(this.brandVoiceService);
    injectStudioSeoService(this.seoService);
    injectStudioRepurposeService(this.repurposeService);
  }
}
