import { createRoute } from '@tanstack/react-router';
import { ProfileEditForm } from '../pages/profile-edit-form';

function ProfileEditPage() {
  return (
    <div className="container max-w-2xl py-6">
      <ProfileEditForm />
    </div>
  );
}

/**
 * Profile Edit Route - 프로필 수정
 * @param parentRoute - adminLayoutRoute를 전달받아 연결
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createProfileEditRoute = (parentRoute: any) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: '/profile/edit',
    component: ProfileEditPage,
  });
