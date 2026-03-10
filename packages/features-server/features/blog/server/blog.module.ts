import { Module, OnModuleInit } from "@nestjs/common";
import { BlogService } from "./service";
import { BlogController } from "./controller";
import { setBlogService } from "./trpc/router";

@Module({
    controllers: [BlogController],
    providers: [BlogService],
    exports: [BlogService],
})
export class BlogModule implements OnModuleInit {
    constructor(private readonly blogService: BlogService) { }

    onModuleInit() {
        setBlogService(this.blogService);
    }
}
