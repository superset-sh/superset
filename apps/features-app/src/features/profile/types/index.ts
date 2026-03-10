export type ProfileData = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateProfileData = {
  name: string;
  avatar?: string | null;
};
