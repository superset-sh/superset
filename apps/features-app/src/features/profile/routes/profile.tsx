import { createRoute } from '@tanstack/react-router';
import { ProfileView } from '../pages/profile-view';

function ProfilePage() {
  return (
    <div className="container max-w-2xl py-6">
      <ProfileView />
    </div>
  );
}

/**
 * Profile Route - 프로필 조회
 * @param parentRoute - adminLayoutRoute를 전달받아 연결
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createProfileRoute = (parentRoute: any) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: '/profile',
    component: ProfilePage,
  });
