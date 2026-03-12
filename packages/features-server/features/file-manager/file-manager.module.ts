import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { STORAGE_PROVIDER } from "./service/storage-provider.interface";
import { SupabaseStorageService } from "./service/supabase-storage.service";
import { FileService } from "./service/file.service";
import { FileController } from "./controller";
import { injectFileService } from "./file-manager.router";

@Module({
  imports: [ConfigModule],
  controllers: [FileController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useClass: SupabaseStorageService,
    },
    FileService,
  ],
  exports: [STORAGE_PROVIDER, FileService],
})
export class FileManagerModule implements OnModuleInit {
  constructor(private readonly fileService: FileService) {}

  onModuleInit() {
    injectFileService(this.fileService);
  }
}
