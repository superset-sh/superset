import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100).describe('그룹명'),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).describe('그룹명'),
});

export const inviteMemberSchema = z.object({
  groupId: z.string().uuid().describe('그룹 ID'),
  email: z.string().email().describe('초대 대상 이메일'),
  role: z
    .enum(['guardian', 'therapist', 'viewer'])
    .describe('부여할 역할 (owner 제외)'),
});

export const updateMemberRoleSchema = z.object({
  groupId: z.string().uuid().describe('그룹 ID'),
  memberId: z.string().uuid().describe('멤버 ID'),
  newRole: z
    .enum(['guardian', 'therapist', 'viewer'])
    .describe('변경할 역할 (owner 제외)'),
});

export const createChildSchema = z.object({
  groupId: z.string().uuid().describe('그룹 ID'),
  name: z.string().min(1).max(50).describe('아이 이름'),
  birthDate: z.string().describe('생년월일 (YYYY-MM-DD)'),
  gender: z.string().max(10).optional().describe('성별'),
  notes: z.string().optional().describe('특이사항'),
  avatar: z.string().optional().describe('프로필 사진 URL'),
});

export const updateChildSchema = z.object({
  childId: z.string().uuid().describe('아이 ID'),
  name: z.string().min(1).max(50).optional().describe('아이 이름'),
  birthDate: z.string().optional().describe('생년월일'),
  gender: z.string().max(10).optional().describe('성별'),
  notes: z.string().optional().describe('특이사항'),
  avatar: z.string().optional().describe('프로필 사진 URL'),
});

export const assignTherapistSchema = z.object({
  childId: z.string().uuid().describe('아이 ID'),
  therapistId: z.string().uuid().describe('치료사 ID'),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type CreateChildInput = z.infer<typeof createChildSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
export type AssignTherapistInput = z.infer<typeof assignTherapistSchema>;
