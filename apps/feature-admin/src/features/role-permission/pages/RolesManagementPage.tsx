import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import type { Permission } from '@superbuilder/drizzle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@superbuilder/feature-ui/shadcn/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@superbuilder/feature-ui/shadcn/alert-dialog';
import { toast } from 'sonner';
import { RoleCard, RoleForm, PermissionTree } from '../components';
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useRoleWithPermissions,
  useAssignPermissionsToRole,
  usePermissionsByCategory,
} from '../hooks';
export function RolesManagementPage() {
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: permissionsByCategory } = usePermissionsByCategory();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);

  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();
  const assignPermissionsMutation = useAssignPermissionsToRole();

  const { data: roleWithPermissions } = useRoleWithPermissions(selectedRole?.id || '');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

  const handleCreate = async (values: any) => {
    try {
      await createMutation.mutateAsync(values);
      toast.success(`Role "${values.name}" has been created successfully.`);
      setCreateDialogOpen(false);
    } catch (error) {
      toast.error('Failed to create role. Please try again.');
    }
  };

  const handleEdit = (role: any) => {
    setSelectedRole(role);
    setEditDialogOpen(true);
  };

  const handleUpdate = async (values: any) => {
    if (!selectedRole) return;

    try {
      await updateMutation.mutateAsync({ id: selectedRole.id, ...values });
      toast.success(`Role "${values.name}" has been updated successfully.`);
      setEditDialogOpen(false);
      setSelectedRole(null);
    } catch (error) {
      toast.error('Failed to update role. Please try again.');
    }
  };

  const handleDelete = (role: any) => {
    setSelectedRole(role);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedRole) return;

    try {
      await deleteMutation.mutateAsync(selectedRole.id);
      toast.success(`Role "${selectedRole.name}" has been deleted successfully.`);
      setDeleteDialogOpen(false);
      setSelectedRole(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete role. Please try again.');
    }
  };

  const handleManagePermissions = (role: any) => {
    setSelectedRole(role);
    setPermissionsDialogOpen(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;

    try {
      await assignPermissionsMutation.mutateAsync({
        roleId: selectedRole.id,
        permissionIds: selectedPermissionIds,
      });
      toast.success(`Permissions for "${selectedRole.name}" have been updated.`);
      setPermissionsDialogOpen(false);
      setSelectedRole(null);
      setSelectedPermissionIds([]);
    } catch (error) {
      toast.error('Failed to update permissions. Please try again.');
    }
  };

  // Update selected permissions when role data loads
  if (roleWithPermissions && permissionsDialogOpen && selectedPermissionIds.length === 0) {
    setSelectedPermissionIds((roleWithPermissions as any).permissions?.map((p: Permission) => p.id) ?? []);
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles Management</h1>
          <p className="text-muted-foreground mt-2">Create and manage user roles and permissions</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Role
        </Button>
      </div>

      {rolesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles?.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onManagePermissions={handleManagePermissions}
            />
          ))}
        </div>
      )}

      {/* Create Role Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Role</DialogTitle>
            <DialogDescription>Add a new role to your system</DialogDescription>
          </DialogHeader>
          <RoleForm
            onSubmit={handleCreate}
            onCancel={() => setCreateDialogOpen(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>Update role information</DialogDescription>
          </DialogHeader>
          {selectedRole && (
            <RoleForm
              role={selectedRole}
              onSubmit={handleUpdate}
              onCancel={() => setEditDialogOpen(false)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the role "{selectedRole?.name}". This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Permissions Dialog */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Permissions - {selectedRole?.name}</DialogTitle>
            <DialogDescription>Select permissions for this role</DialogDescription>
          </DialogHeader>
          {permissionsByCategory && (
            <div className="space-y-4">
              <PermissionTree
                permissionsByCategory={permissionsByCategory as unknown as Record<string, Permission[]>}
                selectedPermissionIds={selectedPermissionIds}
                onSelectionChange={setSelectedPermissionIds}
                disabled={assignPermissionsMutation.isPending}
              />
              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPermissionsDialogOpen(false);
                    setSelectedPermissionIds([]);
                  }}
                  disabled={assignPermissionsMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSavePermissions}
                  disabled={assignPermissionsMutation.isPending}
                >
                  {assignPermissionsMutation.isPending ? 'Saving...' : 'Save Permissions'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
