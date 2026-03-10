import { Module, OnModuleInit } from "@nestjs/common";
import { {{PascalName}}Service } from "./service/{{featureName}}.service";
import { inject{{PascalName}}Service } from "./trpc";

@Module({
  providers: [{{PascalName}}Service],
  exports: [{{PascalName}}Service],
})
export class {{PascalName}}Module implements OnModuleInit {
  constructor(private readonly {{camelName}}Service: {{PascalName}}Service) {}

  onModuleInit() {
    inject{{PascalName}}Service(this.{{camelName}}Service);
  }
}
