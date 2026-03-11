import { Module, OnModuleInit } from "@nestjs/common";
import { FeatureRequestService, FeatureStudioRunnerService } from "./service";
import { injectFeatureStudioServices } from "./trpc";

@Module({
	providers: [FeatureRequestService, FeatureStudioRunnerService],
	exports: [FeatureRequestService, FeatureStudioRunnerService],
})
export class FeatureStudioModule implements OnModuleInit {
	constructor(
		private readonly featureRequestService: FeatureRequestService,
		private readonly featureStudioRunnerService: FeatureStudioRunnerService,
	) {}

	onModuleInit() {
		injectFeatureStudioServices({
			featureRequestService: this.featureRequestService,
			featureStudioRunnerService: this.featureStudioRunnerService,
		});
	}
}
