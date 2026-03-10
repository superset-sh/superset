// Routes (code-based routing)
export {
  createProfileAuthRoutes,
  createProfileRoute,
  createProfileEditRoute,
} from './routes';

// Hooks
export { useProfile, useUpdateProfile } from './hooks';

// UI Components
export { ProfileView } from './pages/profile-view';
export { ProfileEditForm } from './pages/profile-edit-form';
export { ProfileAvatar } from './components/profile-avatar';

// Types
export * from './types';
