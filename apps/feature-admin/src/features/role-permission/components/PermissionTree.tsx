import { Checkbox } from '@superbuilder/feature-ui/shadcn/checkbox';
import { Label } from '@superbuilder/feature-ui/shadcn/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@superbuilder/feature-ui/shadcn/accordion';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import type { Permission } from '@superbuilder/drizzle';

interface PermissionTreeProps {
  permissionsByCategory: Record<string, Permission[]>;
  selectedPermissionIds: string[];
  onSelectionChange: (permissionIds: string[]) => void;
  disabled?: boolean;
}

export function PermissionTree({
  permissionsByCategory,
  selectedPermissionIds,
  onSelectionChange,
  disabled = false,
}: PermissionTreeProps) {
  const isPermissionSelected = (permissionId: string) => {
    return selectedPermissionIds.includes(permissionId);
  };

  const isCategoryFullySelected = (category: string) => {
    const categoryPermissions = permissionsByCategory[category] ?? [];
    return categoryPermissions.every((p) => selectedPermissionIds.includes(p.id));
  };

  const togglePermission = (permissionId: string) => {
    if (disabled) return;

    if (selectedPermissionIds.includes(permissionId)) {
      onSelectionChange(selectedPermissionIds.filter((id) => id !== permissionId));
    } else {
      onSelectionChange([...selectedPermissionIds, permissionId]);
    }
  };

  const toggleCategory = (category: string) => {
    if (disabled) return;

    const categoryPermissions = permissionsByCategory[category] ?? [];
    const categoryPermissionIds = categoryPermissions.map((p) => p.id);

    if (isCategoryFullySelected(category)) {
      onSelectionChange(selectedPermissionIds.filter((id) => !categoryPermissionIds.includes(id)));
    } else {
      const newSelection = new Set([...selectedPermissionIds, ...categoryPermissionIds]);
      onSelectionChange(Array.from(newSelection));
    }
  };

  const getCategoryLabel = (category: string) => {
    return category
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="border rounded-lg">
      <Accordion multiple>
        {Object.entries(permissionsByCategory).map(([category, permissions]) => (
          <AccordionItem key={category} value={category}>
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-3 flex-1">
                <Checkbox
                  checked={isCategoryFullySelected(category)}
                  onCheckedChange={() => toggleCategory(category)}
                  disabled={disabled}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
                <span className="font-medium">{getCategoryLabel(category)}</span>
                <Badge variant="secondary" className="ml-auto">
                  {permissions.filter((p) => selectedPermissionIds.includes(p.id)).length} /{' '}
                  {permissions.length}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 pb-4 space-y-3">
                {permissions.map((permission) => (
                  <div key={permission.id} className="flex items-start gap-3 py-2">
                    <Checkbox
                      id={permission.id}
                      checked={isPermissionSelected(permission.id)}
                      onCheckedChange={() => togglePermission(permission.id)}
                      disabled={disabled}
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor={permission.id}
                        className="cursor-pointer font-medium text-sm"
                      >
                        {permission.resource}.{permission.action}
                        {permission.scope && `.${permission.scope}`}
                      </Label>
                      {permission.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {permission.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
