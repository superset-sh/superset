import type { Profile } from '@superbuilder/drizzle';

export type { Profile };

export type ProfileResponse = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
};
