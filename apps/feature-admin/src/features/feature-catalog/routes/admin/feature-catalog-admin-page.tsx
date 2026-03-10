import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { CatalogAdminList } from "../../pages/catalog-admin-list";
import { CatalogAdminForm } from "../../pages/catalog-admin-form";

export function FeatureCatalogAdminPage() {
  const [activeTab, setActiveTab] = useState("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleEdit = (id: string) => {
    setEditingId(id);
    setActiveTab("form");
  };

  const handleFormComplete = () => {
    setEditingId(null);
    setActiveTab("list");
  };

  const handleNewFeature = () => {
    setEditingId(null);
    setActiveTab("form");
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Feature 카탈로그 관리</h1>
        <p className="text-muted-foreground">
          SaaS Feature 카탈로그를 관리합니다
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">목록</TabsTrigger>
          <TabsTrigger value="form">
            {editingId ? "수정" : "등록"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <CatalogAdminList onEdit={handleEdit} onNew={handleNewFeature} />
        </TabsContent>

        <TabsContent value="form" className="space-y-4">
          <CatalogAdminForm
            editingId={editingId}
            onComplete={handleFormComplete}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
