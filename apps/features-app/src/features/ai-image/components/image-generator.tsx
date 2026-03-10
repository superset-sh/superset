import { useState } from "react";
import { DEFAULT_IMAGE_MODEL } from "@superbuilder/features-server/ai-image/types";
import type { AiImageModelId, AiImageFormat } from "@superbuilder/features-server/ai-image/types";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { useImageGeneration, useContentThemes } from "../hooks/use-image-generation";
import { FormatSelector } from "../generation/components/format-selector";
import { ModelSelector } from "../generation/components/model-selector";
import { PromptInput } from "../generation/components/prompt-input";
import { ProgressiveImage } from "../generation/components/progressive-image";
import { StyleSelector } from "../generation/components/style-selector";
import { ImageHistory } from "../generation/components/image-history";
import { ContentThemeSelector } from "../content-theme/components/content-theme-selector";

interface Props {
  className?: string;
  bare?: boolean;
}

export function ImageGenerator({ className, bare = false }: Props) {
  const [selectedStyleId, setSelectedStyleId] = useState<string | undefined>();
  const [selectedModel, setSelectedModel] = useState<AiImageModelId>(DEFAULT_IMAGE_MODEL);
  const [selectedFormat, setSelectedFormat] = useState<AiImageFormat>("feed");
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [themeVariables, setThemeVariables] = useState<Record<string, string>>({});
  const { generate, streamStatus, isGenerating } = useImageGeneration();
  const { data: themes = [] } = useContentThemes();

  const handleGenerate = (prompt: string) => {
    generate({
      prompt,
      model: selectedModel,
      format: selectedFormat,
      styleTemplateId: selectedStyleId,
      contentThemeId: selectedThemeId ?? undefined,
      themeVariables: selectedThemeId ? themeVariables : undefined,
    });
  };

  const handleReuse = (prompt: string, styleTemplateId?: string) => {
    if (styleTemplateId) setSelectedStyleId(styleTemplateId);
    generate({ prompt, model: selectedModel, format: selectedFormat, styleTemplateId });
  };

  const handleFormatRecommended = (format: AiImageFormat) => {
    setSelectedFormat(format);
  };

  const handleStyleRecommended = (styleIds: string[]) => {
    if (styleIds[0]) {
      setSelectedStyleId(styleIds[0]);
    }
  };

  const selectedTheme = themes.find((t) => t.id === selectedThemeId);
  const hasIncompleteVars = selectedTheme
    ? getRequiredVariables(selectedTheme.promptTemplate).some(
        (v) => !themeVariables[v]?.trim(),
      )
    : false;

  const content = (
    <Tabs defaultValue="generate" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="generate" className="flex-1">
          생성
        </TabsTrigger>
        <TabsTrigger value="history" className="flex-1">
          이력
        </TabsTrigger>
      </TabsList>

      <TabsContent value="generate" className="flex flex-col gap-4 pt-2">
        <FormatSelector selectedFormat={selectedFormat} onSelect={setSelectedFormat} />
        <ModelSelector selectedId={selectedModel} onSelect={setSelectedModel} />
        <ContentThemeSelector
          themes={themes}
          selectedThemeId={selectedThemeId}
          themeVariables={themeVariables}
          onSelectTheme={setSelectedThemeId}
          onChangeVariables={setThemeVariables}
          onFormatRecommended={handleFormatRecommended}
          onStyleRecommended={handleStyleRecommended}
        />
        <StyleSelector selectedId={selectedStyleId} onSelect={setSelectedStyleId} />
        <PromptInput
          onSubmit={handleGenerate}
          isGenerating={isGenerating}
          disabled={hasIncompleteVars}
        />
        <ProgressiveImage streamStatus={streamStatus} format={selectedFormat} />
      </TabsContent>

      <TabsContent value="history" className="pt-2">
        <ImageHistory onReuse={handleReuse} />
      </TabsContent>
    </Tabs>
  );

  if (bare) {
    return <div className={cn("w-full", className)}>{content}</div>;
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="text-lg">AI 이미지 생성</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

/* Helpers */

function getRequiredVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}
