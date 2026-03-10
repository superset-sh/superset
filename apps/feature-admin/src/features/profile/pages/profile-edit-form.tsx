import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card';
import { Input } from '@superbuilder/feature-ui/shadcn/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@superbuilder/feature-ui/shadcn/form';
import { useProfile, useUpdateProfile } from '../hooks';
import { ProfileAvatar } from '../components/profile-avatar';
import type { ProfileData } from '../types';

const formSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요').max(50),
  avatar: z.string().url().nullable().optional(),
});

type FormData = z.infer<typeof formSchema>;

export function ProfileEditForm() {
  const navigate = useNavigate();
  const { data, isLoading: profileLoading } = useProfile();
  const profile = data as ProfileData | undefined;
  const updateProfile = useUpdateProfile();

  const form = useForm<FormData>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: {
      name: '',
      avatar: null,
    },
  });

  // Set form values when profile data is loaded
  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name,
        avatar: profile.avatar,
      });
    }
  }, [profile, form]);

  const onSubmit = (data: FormData) => {
    updateProfile.mutate(data, {
      onSuccess: () => {
        toast.success('프로필이 업데이트되었습니다');
        navigate({ to: '/profile' });
      },
      onError: () => {
        toast.error('프로필 업데이트에 실패했습니다');
      },
    });
  };

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-4">
              <ProfileAvatar
                src={form.watch('avatar')}
                name={form.watch('name')}
                size="lg"
              />
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="avatar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avatar URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/avatar.png"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value || null)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Name Field */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="이름을 입력하세요" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email (Read-only) */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <Input
                value={profile?.email ?? ''}
                disabled
                className="mt-1.5 bg-muted"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                이메일은 변경할 수 없습니다
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Save Changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: '/profile' })}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
