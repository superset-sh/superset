import { ImageGenerator } from "../components/image-generator";

export function AiImagePage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI 이미지 생성</h1>
        <p className="text-muted-foreground">
          프롬프트와 스타일을 선택하여 AI 이미지를 생성하세요.
        </p>
      </div>
      <div className="max-w-2xl">
        <ImageGenerator bare />
      </div>
    </div>
  );
}
