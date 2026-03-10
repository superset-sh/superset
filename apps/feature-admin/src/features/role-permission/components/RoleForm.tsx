import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@superbuilder/feature-ui/shadcn/form';
import { Input } from '@superbuilder/feature-ui/shadcn/input';
import { Textarea } from '@superbuilder/feature-ui/shadcn/textarea';
const roleFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').optional(),
  icon: z.string().max(50).optional(),
  priority: z.coerce.number().int().min(0).max(100).default(0),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

interface RoleFormProps {
  role?: any;
  onSubmit: (values: RoleFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function RoleForm({ role, onSubmit, onCancel, isLoading }: RoleFormProps) {
  const form = useForm<RoleFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: standardSchemaResolver(roleFormSchema) as any,
    defaultValues: {
      name: role?.name || '',
      slug: role?.slug || '',
      description: role?.description || '',
      color: role?.color || '#10B981',
      icon: role?.icon || '👤',
      priority: role?.priority || 0,
    },
  });

  const handleSubmit = async (values: RoleFormValues) => {
    await onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role Name</FormLabel>
              <FormControl>
                <Input placeholder="Content Manager" {...field} />
              </FormControl>
              <FormDescription>The display name for this role</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input placeholder="content-manager" {...field} />
              </FormControl>
              <FormDescription>Unique identifier (lowercase, hyphens allowed)</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Can create and edit content..."
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormDescription>Brief description of this role's purpose</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    <Input type="color" className="w-14 h-10" {...field} />
                    <Input placeholder="#10B981" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="icon"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Icon</FormLabel>
                <FormControl>
                  <Input placeholder="👤" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <FormControl>
                <Input type="number" min={0} max={100} {...field} />
              </FormControl>
              <FormDescription>Higher priority roles appear first (0-100)</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
