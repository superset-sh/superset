import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SupabaseStorageService, FileService } from "./service";
import { FileController } from "./controller";
import { injectFileService } from "./file-manager.router";

@Module({
  imports: [ConfigModule],
  controllers: [FileController],
  providers: [SupabaseStorageService, FileService],
  exports: [SupabaseStorageService, FileService],
})
export class FileManagerModule implements OnModuleInit {
  constructor(private readonly fileService: FileService) {}

  onModuleInit() {
    injectFileService(this.fileService);
  }
}
