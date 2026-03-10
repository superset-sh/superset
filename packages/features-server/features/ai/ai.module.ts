import { Module, OnModuleInit } from "@nestjs/common";
import { LLMService } from "./service";
import { AIController } from "./controller";
import { injectAIService } from "./trpc";

@Module({
  controllers: [AIController],
  providers: [LLMService],
  exports: [LLMService],
})
export class AIModule implements OnModuleInit {
  constructor(private readonly llmService: LLMService) {}

  onModuleInit() {
    injectAIService(this.llmService);
  }
}
