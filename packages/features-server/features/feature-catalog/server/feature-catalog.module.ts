import { Module, OnModuleInit } from "@nestjs/common";
import { FeatureCatalogService } from "./service";
import { FeatureCatalogController } from "./controller";
import { setFeatureCatalogService } from "./trpc/router";

@Module({
  controllers: [FeatureCatalogController],
  providers: [FeatureCatalogService],
  exports: [FeatureCatalogService],
})
export class FeatureCatalogModule implements OnModuleInit {
  constructor(
    private readonly featureCatalogService: FeatureCatalogService,
  ) {}

  onModuleInit() {
    setFeatureCatalogService(this.featureCatalogService);
  }
}
