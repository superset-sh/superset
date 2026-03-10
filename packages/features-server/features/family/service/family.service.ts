import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, count, desc, ilike } from 'drizzle-orm';
import {
  InjectDrizzle,
  type DrizzleDB,
  familyGroups,
  familyMembers,
  familyInvitations,
  familyChildren,
  familyChildAssignments,
  profiles,
} from '@superbuilder/drizzle';
import { createLogger } from '../../../core/logger';
import type {
  CreateGroupInput,
  UpdateGroupInput,
  InviteMemberInput,
  UpdateMemberRoleInput,
  CreateChildInput,
  UpdateChildInput,
  AssignTherapistInput,
} from '../dto';

const logger = createLogger('family');

const MAX_CHILDREN_PER_GROUP = 10;

@Injectable()
export class FamilyService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
  ) {}

  // ============================================================================
  // Helpers
  // ============================================================================

  private async getMemberRole(
    groupId: string,
    userId: string,
  ): Promise<string | null> {
    const [member] = await this.db
      .select({ role: familyMembers.role })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.groupId, groupId),
          eq(familyMembers.userId, userId),
        ),
      )
      .limit(1);
    return member?.role ?? null;
  }

  private assertMember(role: string | null): void {
    if (!role) {
      throw new ForbiddenException('이 그룹의 멤버가 아닙니다');
    }
  }

  private assertOwnerOrGuardian(role: string | null): void {
    this.assertMember(role);
    if (role !== 'owner' && role !== 'guardian') {
      throw new ForbiddenException('owner 또는 guardian 권한이 필요합니다');
    }
  }

  private assertOwner(role: string | null): void {
    this.assertMember(role);
    if (role !== 'owner') {
      throw new ForbiddenException('owner 권한이 필요합니다');
    }
  }

  private calculateAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  // ============================================================================
  // Group Methods (5)
  // ============================================================================

  /**
   * 1. 그룹 생성 + 생성자를 owner 멤버로 추가
   */
  async createGroup(userId: string, input: CreateGroupInput) {
    const [group] = await this.db
      .insert(familyGroups)
      .values({ name: input.name, ownerId: userId })
      .returning();

    if (!group) {
      throw new BadRequestException('그룹 생성에 실패했습니다');
    }

    await this.db.insert(familyMembers).values({
      groupId: group.id,
      userId,
      role: 'owner',
    });

    logger.info('Family group created', {
      'family.group_id': group.id,
      'family.group_name': group.name,
      'user.id': userId,
    });

    return group;
  }

  /**
   * 2. 내 그룹 목록 — memberCount, childCount 포함
   */
  async getMyGroups(userId: string) {
    const myMemberships = await this.db
      .select({
        groupId: familyMembers.groupId,
        role: familyMembers.role,
      })
      .from(familyMembers)
      .where(eq(familyMembers.userId, userId));

    if (myMemberships.length === 0) return [];

    const groupIds = myMemberships.map((m) => m.groupId);
    const roleMap = new Map(myMemberships.map((m) => [m.groupId, m.role]));

    const results: Array<
      typeof familyGroups.$inferSelect & {
        myRole: string;
        memberCount: number;
        childCount: number;
      }
    > = [];

    for (const groupId of groupIds) {
      const [group] = await this.db
        .select()
        .from(familyGroups)
        .where(and(eq(familyGroups.id, groupId), eq(familyGroups.isActive, true)))
        .limit(1);

      if (!group) continue;

      const [memberCountResult] = await this.db
        .select({ count: count() })
        .from(familyMembers)
        .where(eq(familyMembers.groupId, groupId));

      const [childCountResult] = await this.db
        .select({ count: count() })
        .from(familyChildren)
        .where(
          and(
            eq(familyChildren.groupId, groupId),
            eq(familyChildren.isActive, true),
          ),
        );

      results.push({
        ...group,
        myRole: roleMap.get(groupId)!,
        memberCount: memberCountResult?.count ?? 0,
        childCount: childCountResult?.count ?? 0,
      });
    }

    return results;
  }

  /**
   * 3. 그룹 상세 — 멤버 + 아이 목록 포함
   */
  async getGroup(userId: string, groupId: string) {
    const role = await this.getMemberRole(groupId, userId);
    this.assertMember(role);

    const [group] = await this.db
      .select()
      .from(familyGroups)
      .where(and(eq(familyGroups.id, groupId), eq(familyGroups.isActive, true)))
      .limit(1);

    if (!group) {
      throw new NotFoundException('그룹을 찾을 수 없습니다');
    }

    const members = await this.db
      .select({
        id: familyMembers.id,
        userId: familyMembers.userId,
        role: familyMembers.role,
        joinedAt: familyMembers.joinedAt,
        userName: profiles.name,
        userEmail: profiles.email,
        userAvatar: profiles.avatar,
      })
      .from(familyMembers)
      .innerJoin(profiles, eq(familyMembers.userId, profiles.id))
      .where(eq(familyMembers.groupId, groupId))
      .orderBy(familyMembers.joinedAt);

    const children = await this.db
      .select()
      .from(familyChildren)
      .where(
        and(
          eq(familyChildren.groupId, groupId),
          eq(familyChildren.isActive, true),
        ),
      )
      .orderBy(familyChildren.createdAt);

    const childrenWithAge = children.map((child) => ({
      ...child,
      age: this.calculateAge(child.birthDate),
    }));

    const pendingInvitations = await this.db
      .select()
      .from(familyInvitations)
      .where(
        and(
          eq(familyInvitations.groupId, groupId),
          eq(familyInvitations.status, 'pending'),
        ),
      )
      .orderBy(desc(familyInvitations.createdAt));

    return {
      ...group,
      myRole: role,
      members,
      children: childrenWithAge,
      pendingInvitations,
    };
  }

  /**
   * 4. 그룹명 수정 (owner/guardian)
   */
  async updateGroup(userId: string, groupId: string, input: UpdateGroupInput) {
    const role = await this.getMemberRole(groupId, userId);
    this.assertOwnerOrGuardian(role);

    const [updated] = await this.db
      .update(familyGroups)
      .set({ name: input.name, updatedAt: new Date() })
      .where(and(eq(familyGroups.id, groupId), eq(familyGroups.isActive, true)))
      .returning();

    if (!updated) {
      throw new NotFoundException('그룹을 찾을 수 없습니다');
    }

    logger.info('Family group updated', {
      'family.group_id': groupId,
      'family.group_name': input.name,
      'user.id': userId,
    });

    return updated;
  }

  /**
   * 5. 그룹 삭제 (soft delete, owner만)
   */
  async deleteGroup(userId: string, groupId: string) {
    const role = await this.getMemberRole(groupId, userId);
    this.assertOwner(role);

    const [updated] = await this.db
      .update(familyGroups)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(familyGroups.id, groupId), eq(familyGroups.isActive, true)))
      .returning();

    if (!updated) {
      throw new NotFoundException('그룹을 찾을 수 없습니다');
    }

    logger.info('Family group deleted', {
      'family.group_id': groupId,
      'user.id': userId,
    });

    return { success: true };
  }

  // ============================================================================
  // Member Methods (6)
  // ============================================================================

  /**
   * 6. 멤버 초대 — owner/guardian만, owner 역할 초대 불가
   */
  async inviteMember(userId: string, input: InviteMemberInput) {
    const role = await this.getMemberRole(input.groupId, userId);
    this.assertOwnerOrGuardian(role);

    // 이미 멤버인지 확인
    const [existingProfile] = await this.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.email, input.email))
      .limit(1);

    if (existingProfile) {
      const existingRole = await this.getMemberRole(
        input.groupId,
        existingProfile.id,
      );
      if (existingRole) {
        throw new ConflictException('이미 그룹의 멤버입니다');
      }
    }

    // 이미 pending 초대가 있는지 확인
    const [existingInvitation] = await this.db
      .select()
      .from(familyInvitations)
      .where(
        and(
          eq(familyInvitations.groupId, input.groupId),
          eq(familyInvitations.invitedEmail, input.email),
          eq(familyInvitations.status, 'pending'),
        ),
      )
      .limit(1);

    if (existingInvitation) {
      throw new ConflictException('이미 대기 중인 초대가 있습니다');
    }

    // UUID 토큰 생성
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [invitation] = await this.db
      .insert(familyInvitations)
      .values({
        groupId: input.groupId,
        invitedBy: userId,
        invitedEmail: input.email,
        role: input.role,
        token,
        expiresAt,
      })
      .returning();

    if (!invitation) {
      throw new BadRequestException('초대 생성에 실패했습니다');
    }

    logger.info('Family member invited', {
      'family.group_id': input.groupId,
      'family.invitation_id': invitation.id,
      'family.invited_role': input.role,
      'user.id': userId,
    });

    return invitation;
  }

  /**
   * 7. 초대 수락 — 토큰 유효성 + 이메일 매칭 확인
   */
  async acceptInvitation(userId: string, token: string) {
    const [invitation] = await this.db
      .select()
      .from(familyInvitations)
      .where(
        and(
          eq(familyInvitations.token, token),
          eq(familyInvitations.status, 'pending'),
        ),
      )
      .limit(1);

    if (!invitation) {
      throw new NotFoundException('유효하지 않은 초대입니다');
    }

    if (new Date() > invitation.expiresAt) {
      await this.db
        .update(familyInvitations)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(familyInvitations.id, invitation.id));
      throw new BadRequestException('만료된 초대입니다');
    }

    // 이메일 매칭 확인
    const [profile] = await this.db
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!profile || profile.email !== invitation.invitedEmail) {
      throw new ForbiddenException('초대 대상 이메일과 일치하지 않습니다');
    }

    // 이미 멤버인지 확인
    const existingRole = await this.getMemberRole(invitation.groupId, userId);
    if (existingRole) {
      throw new ConflictException('이미 그룹의 멤버입니다');
    }

    // 멤버 추가
    await this.db.insert(familyMembers).values({
      groupId: invitation.groupId,
      userId,
      role: invitation.role,
    });

    // 초대 상태 업데이트
    await this.db
      .update(familyInvitations)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(eq(familyInvitations.id, invitation.id));

    logger.info('Family invitation accepted', {
      'family.group_id': invitation.groupId,
      'family.invitation_id': invitation.id,
      'user.id': userId,
    });

    return { success: true, groupId: invitation.groupId };
  }

  /**
   * 8. 초대 거절
   */
  async rejectInvitation(userId: string, token: string) {
    const [invitation] = await this.db
      .select()
      .from(familyInvitations)
      .where(
        and(
          eq(familyInvitations.token, token),
          eq(familyInvitations.status, 'pending'),
        ),
      )
      .limit(1);

    if (!invitation) {
      throw new NotFoundException('유효하지 않은 초대입니다');
    }

    // 이메일 매칭 확인
    const [profile] = await this.db
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!profile || profile.email !== invitation.invitedEmail) {
      throw new ForbiddenException('초대 대상 이메일과 일치하지 않습니다');
    }

    await this.db
      .update(familyInvitations)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(familyInvitations.id, invitation.id));

    logger.info('Family invitation rejected', {
      'family.group_id': invitation.groupId,
      'family.invitation_id': invitation.id,
      'user.id': userId,
    });

    return { success: true };
  }

  /**
   * 9. 멤버 역할 변경 — owner/guardian만, owner 역할로 변경 불가
   *    guardian은 therapist/viewer만 변경 가능
   */
  async updateMemberRole(userId: string, input: UpdateMemberRoleInput) {
    const actorRole = await this.getMemberRole(input.groupId, userId);
    this.assertOwnerOrGuardian(actorRole);

    const [targetMember] = await this.db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, input.memberId),
          eq(familyMembers.groupId, input.groupId),
        ),
      )
      .limit(1);

    if (!targetMember) {
      throw new NotFoundException('멤버를 찾을 수 없습니다');
    }

    // owner 역할 변경 불가
    if (targetMember.role === 'owner') {
      throw new ForbiddenException('owner의 역할은 변경할 수 없습니다');
    }

    // guardian은 therapist/viewer만 변경 가능
    if (actorRole === 'guardian') {
      if (targetMember.role === 'guardian') {
        throw new ForbiddenException(
          'guardian은 다른 guardian의 역할을 변경할 수 없습니다',
        );
      }
      if (input.newRole === 'guardian') {
        throw new ForbiddenException(
          'guardian은 guardian 역할을 부여할 수 없습니다',
        );
      }
    }

    await this.db
      .update(familyMembers)
      .set({ role: input.newRole, updatedAt: new Date() })
      .where(eq(familyMembers.id, input.memberId));

    logger.info('Family member role updated', {
      'family.group_id': input.groupId,
      'family.member_id': input.memberId,
      'family.new_role': input.newRole,
      'user.id': userId,
    });

    return { success: true };
  }

  /**
   * 10. 멤버 제거 — owner/guardian만, owner 제거 불가
   *     guardian은 therapist/viewer만 제거 가능
   */
  async removeMember(userId: string, groupId: string, memberId: string) {
    const actorRole = await this.getMemberRole(groupId, userId);
    this.assertOwnerOrGuardian(actorRole);

    const [targetMember] = await this.db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, memberId),
          eq(familyMembers.groupId, groupId),
        ),
      )
      .limit(1);

    if (!targetMember) {
      throw new NotFoundException('멤버를 찾을 수 없습니다');
    }

    if (targetMember.role === 'owner') {
      throw new ForbiddenException('owner는 제거할 수 없습니다');
    }

    // guardian은 therapist/viewer만 제거 가능
    if (actorRole === 'guardian' && targetMember.role === 'guardian') {
      throw new ForbiddenException(
        'guardian은 다른 guardian을 제거할 수 없습니다',
      );
    }

    await this.db
      .delete(familyMembers)
      .where(eq(familyMembers.id, memberId));

    logger.info('Family member removed', {
      'family.group_id': groupId,
      'family.member_id': memberId,
      'family.removed_user_id': targetMember.userId,
      'user.id': userId,
    });

    return { success: true };
  }

  /**
   * 11. 그룹 탈퇴 — owner는 탈퇴 불가
   */
  async leaveGroup(userId: string, groupId: string) {
    const role = await this.getMemberRole(groupId, userId);
    this.assertMember(role);

    if (role === 'owner') {
      throw new ForbiddenException(
        'owner는 그룹을 탈퇴할 수 없습니다. 그룹을 삭제하거나 owner를 양도하세요.',
      );
    }

    await this.db
      .delete(familyMembers)
      .where(
        and(
          eq(familyMembers.groupId, groupId),
          eq(familyMembers.userId, userId),
        ),
      );

    logger.info('Family member left group', {
      'family.group_id': groupId,
      'user.id': userId,
    });

    return { success: true };
  }

  // ============================================================================
  // Child Methods (9)
  // ============================================================================

  /**
   * 12. 아이 등록 — owner/guardian만, 인원 제한 체크
   */
  async createChild(userId: string, input: CreateChildInput) {
    const role = await this.getMemberRole(input.groupId, userId);
    this.assertOwnerOrGuardian(role);

    // 인원 제한 체크
    const [activeChildCount] = await this.db
      .select({ count: count() })
      .from(familyChildren)
      .where(
        and(
          eq(familyChildren.groupId, input.groupId),
          eq(familyChildren.isActive, true),
        ),
      );

    if ((activeChildCount?.count ?? 0) >= MAX_CHILDREN_PER_GROUP) {
      throw new BadRequestException(
        `그룹당 최대 ${MAX_CHILDREN_PER_GROUP}명의 아이만 등록할 수 있습니다`,
      );
    }

    const [child] = await this.db
      .insert(familyChildren)
      .values({
        groupId: input.groupId,
        name: input.name,
        birthDate: input.birthDate,
        gender: input.gender,
        notes: input.notes,
        avatar: input.avatar,
        createdBy: userId,
      })
      .returning();

    if (!child) {
      throw new BadRequestException('아이 등록에 실패했습니다');
    }

    logger.info('Family child created', {
      'family.group_id': input.groupId,
      'family.child_id': child.id,
      'family.child_name': child.name,
      'user.id': userId,
    });

    return { ...child, age: this.calculateAge(child.birthDate) };
  }

  /**
   * 13. 아이 목록 — therapist는 배정된 아이만 조회, 만 나이 포함
   */
  async getChildren(userId: string, groupId: string) {
    const role = await this.getMemberRole(groupId, userId);
    this.assertMember(role);

    let children;

    if (role === 'therapist') {
      // therapist는 배정된 아이만 조회
      children = await this.db
        .select({
          id: familyChildren.id,
          groupId: familyChildren.groupId,
          name: familyChildren.name,
          birthDate: familyChildren.birthDate,
          gender: familyChildren.gender,
          notes: familyChildren.notes,
          avatar: familyChildren.avatar,
          isActive: familyChildren.isActive,
          createdBy: familyChildren.createdBy,
          createdAt: familyChildren.createdAt,
          updatedAt: familyChildren.updatedAt,
        })
        .from(familyChildren)
        .innerJoin(
          familyChildAssignments,
          eq(familyChildren.id, familyChildAssignments.childId),
        )
        .where(
          and(
            eq(familyChildren.groupId, groupId),
            eq(familyChildren.isActive, true),
            eq(familyChildAssignments.therapistId, userId),
          ),
        )
        .orderBy(familyChildren.createdAt);
    } else {
      children = await this.db
        .select()
        .from(familyChildren)
        .where(
          and(
            eq(familyChildren.groupId, groupId),
            eq(familyChildren.isActive, true),
          ),
        )
        .orderBy(familyChildren.createdAt);
    }

    return children.map((child) => ({
      ...child,
      age: this.calculateAge(child.birthDate),
    }));
  }

  /**
   * 14. 아이 상세 — therapist는 배정된 아이만
   */
  async getChild(userId: string, childId: string) {
    const [child] = await this.db
      .select()
      .from(familyChildren)
      .where(eq(familyChildren.id, childId))
      .limit(1);

    if (!child) {
      throw new NotFoundException('아이를 찾을 수 없습니다');
    }

    const role = await this.getMemberRole(child.groupId, userId);
    this.assertMember(role);

    // therapist는 배정된 아이만
    if (role === 'therapist') {
      const [assignment] = await this.db
        .select()
        .from(familyChildAssignments)
        .where(
          and(
            eq(familyChildAssignments.childId, childId),
            eq(familyChildAssignments.therapistId, userId),
          ),
        )
        .limit(1);

      if (!assignment) {
        throw new ForbiddenException('배정되지 않은 아이입니다');
      }
    }

    // 치료사 배정 정보
    const assignments = await this.db
      .select({
        id: familyChildAssignments.id,
        therapistId: familyChildAssignments.therapistId,
        assignedBy: familyChildAssignments.assignedBy,
        createdAt: familyChildAssignments.createdAt,
        therapistName: profiles.name,
        therapistEmail: profiles.email,
      })
      .from(familyChildAssignments)
      .innerJoin(
        profiles,
        eq(familyChildAssignments.therapistId, profiles.id),
      )
      .where(eq(familyChildAssignments.childId, childId));

    return {
      ...child,
      age: this.calculateAge(child.birthDate),
      assignments,
    };
  }

  /**
   * 15. 아이 정보 수정 — owner/guardian만
   */
  async updateChild(userId: string, input: UpdateChildInput) {
    const [child] = await this.db
      .select()
      .from(familyChildren)
      .where(eq(familyChildren.id, input.childId))
      .limit(1);

    if (!child) {
      throw new NotFoundException('아이를 찾을 수 없습니다');
    }

    const role = await this.getMemberRole(child.groupId, userId);
    this.assertOwnerOrGuardian(role);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.birthDate !== undefined) updateData.birthDate = input.birthDate;
    if (input.gender !== undefined) updateData.gender = input.gender;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.avatar !== undefined) updateData.avatar = input.avatar;

    const [updated] = await this.db
      .update(familyChildren)
      .set(updateData)
      .where(eq(familyChildren.id, input.childId))
      .returning();

    if (!updated) {
      throw new NotFoundException('아이를 찾을 수 없습니다');
    }

    logger.info('Family child updated', {
      'family.child_id': input.childId,
      'family.group_id': child.groupId,
      'user.id': userId,
    });

    return { ...updated, age: this.calculateAge(updated.birthDate) };
  }

  /**
   * 16. 아이 비활성화 — owner/guardian만
   */
  async deactivateChild(userId: string, childId: string) {
    const [child] = await this.db
      .select()
      .from(familyChildren)
      .where(eq(familyChildren.id, childId))
      .limit(1);

    if (!child) {
      throw new NotFoundException('아이를 찾을 수 없습니다');
    }

    const role = await this.getMemberRole(child.groupId, userId);
    this.assertOwnerOrGuardian(role);

    await this.db
      .update(familyChildren)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(familyChildren.id, childId));

    logger.info('Family child deactivated', {
      'family.child_id': childId,
      'family.group_id': child.groupId,
      'user.id': userId,
    });

    return { success: true };
  }

  /**
   * 17. 아이 재활성화 — owner/guardian만, 인원 제한 재확인
   */
  async reactivateChild(userId: string, childId: string) {
    const [child] = await this.db
      .select()
      .from(familyChildren)
      .where(eq(familyChildren.id, childId))
      .limit(1);

    if (!child) {
      throw new NotFoundException('아이를 찾을 수 없습니다');
    }

    const role = await this.getMemberRole(child.groupId, userId);
    this.assertOwnerOrGuardian(role);

    // 인원 제한 재확인
    const [activeChildCount] = await this.db
      .select({ count: count() })
      .from(familyChildren)
      .where(
        and(
          eq(familyChildren.groupId, child.groupId),
          eq(familyChildren.isActive, true),
        ),
      );

    if ((activeChildCount?.count ?? 0) >= MAX_CHILDREN_PER_GROUP) {
      throw new BadRequestException(
        `그룹당 최대 ${MAX_CHILDREN_PER_GROUP}명의 아이만 등록할 수 있습니다`,
      );
    }

    await this.db
      .update(familyChildren)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(familyChildren.id, childId));

    logger.info('Family child reactivated', {
      'family.child_id': childId,
      'family.group_id': child.groupId,
      'user.id': userId,
    });

    return { success: true };
  }

  /**
   * 18. 치료사 배정 — owner/guardian만, therapistId가 그룹 therapist 멤버인지 확인
   */
  async assignTherapist(userId: string, input: AssignTherapistInput) {
    const [child] = await this.db
      .select()
      .from(familyChildren)
      .where(eq(familyChildren.id, input.childId))
      .limit(1);

    if (!child) {
      throw new NotFoundException('아이를 찾을 수 없습니다');
    }

    const actorRole = await this.getMemberRole(child.groupId, userId);
    this.assertOwnerOrGuardian(actorRole);

    // therapistId가 그룹의 therapist 멤버인지 확인
    const therapistRole = await this.getMemberRole(
      child.groupId,
      input.therapistId,
    );

    if (therapistRole !== 'therapist') {
      throw new BadRequestException(
        '대상이 이 그룹의 therapist 멤버가 아닙니다',
      );
    }

    // 이미 배정되었는지 확인
    const [existing] = await this.db
      .select()
      .from(familyChildAssignments)
      .where(
        and(
          eq(familyChildAssignments.childId, input.childId),
          eq(familyChildAssignments.therapistId, input.therapistId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException('이미 배정된 치료사입니다');
    }

    const [assignment] = await this.db
      .insert(familyChildAssignments)
      .values({
        childId: input.childId,
        therapistId: input.therapistId,
        assignedBy: userId,
      })
      .returning();

    if (!assignment) {
      throw new BadRequestException('치료사 배정에 실패했습니다');
    }

    logger.info('Therapist assigned to child', {
      'family.child_id': input.childId,
      'family.therapist_id': input.therapistId,
      'family.group_id': child.groupId,
      'user.id': userId,
    });

    return assignment;
  }

  /**
   * 19. 치료사 배정 해제 — owner/guardian만
   */
  async unassignTherapist(userId: string, input: AssignTherapistInput) {
    const [child] = await this.db
      .select()
      .from(familyChildren)
      .where(eq(familyChildren.id, input.childId))
      .limit(1);

    if (!child) {
      throw new NotFoundException('아이를 찾을 수 없습니다');
    }

    const actorRole = await this.getMemberRole(child.groupId, userId);
    this.assertOwnerOrGuardian(actorRole);

    const [assignment] = await this.db
      .select()
      .from(familyChildAssignments)
      .where(
        and(
          eq(familyChildAssignments.childId, input.childId),
          eq(familyChildAssignments.therapistId, input.therapistId),
        ),
      )
      .limit(1);

    if (!assignment) {
      throw new NotFoundException('배정 정보를 찾을 수 없습니다');
    }

    await this.db
      .delete(familyChildAssignments)
      .where(eq(familyChildAssignments.id, assignment.id));

    logger.info('Therapist unassigned from child', {
      'family.child_id': input.childId,
      'family.therapist_id': input.therapistId,
      'family.group_id': child.groupId,
      'user.id': userId,
    });

    return { success: true };
  }

  /**
   * 20. 아이의 치료사 배정 목록 — owner/guardian만
   */
  async getChildAssignments(userId: string, childId: string) {
    const [child] = await this.db
      .select()
      .from(familyChildren)
      .where(eq(familyChildren.id, childId))
      .limit(1);

    if (!child) {
      throw new NotFoundException('아이를 찾을 수 없습니다');
    }

    const role = await this.getMemberRole(child.groupId, userId);
    this.assertOwnerOrGuardian(role);

    const assignments = await this.db
      .select({
        id: familyChildAssignments.id,
        therapistId: familyChildAssignments.therapistId,
        assignedBy: familyChildAssignments.assignedBy,
        createdAt: familyChildAssignments.createdAt,
        therapistName: profiles.name,
        therapistEmail: profiles.email,
        therapistAvatar: profiles.avatar,
      })
      .from(familyChildAssignments)
      .innerJoin(
        profiles,
        eq(familyChildAssignments.therapistId, profiles.id),
      )
      .where(eq(familyChildAssignments.childId, childId))
      .orderBy(familyChildAssignments.createdAt);

    return assignments;
  }

  // ============================================================================
  // Admin Methods (2)
  // ============================================================================

  /**
   * 21. [Admin] 전체 그룹 목록 (페이지네이션)
   */
  async adminListGroups(input: {
    page: number;
    limit: number;
    search?: string;
  }) {
    const { page, limit, search } = input;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];
    if (search) {
      conditions.push(ilike(familyGroups.name, `%${search}%`));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(familyGroups)
        .where(whereClause)
        .orderBy(desc(familyGroups.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(familyGroups)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    // memberCount, childCount 추가
    const dataWithCounts = await Promise.all(
      data.map(async (group) => {
        const [memberCountResult] = await this.db
          .select({ count: count() })
          .from(familyMembers)
          .where(eq(familyMembers.groupId, group.id));

        const [childCountResult] = await this.db
          .select({ count: count() })
          .from(familyChildren)
          .where(
            and(
              eq(familyChildren.groupId, group.id),
              eq(familyChildren.isActive, true),
            ),
          );

        return {
          ...group,
          memberCount: memberCountResult?.count ?? 0,
          childCount: childCountResult?.count ?? 0,
        };
      }),
    );

    return {
      data: dataWithCounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 22. [Admin] 그룹 상세 — 멤버 + 아이 포함
   */
  async adminGetGroupDetail(groupId: string) {
    const [group] = await this.db
      .select()
      .from(familyGroups)
      .where(eq(familyGroups.id, groupId))
      .limit(1);

    if (!group) {
      throw new NotFoundException('그룹을 찾을 수 없습니다');
    }

    const members = await this.db
      .select({
        id: familyMembers.id,
        userId: familyMembers.userId,
        role: familyMembers.role,
        joinedAt: familyMembers.joinedAt,
        userName: profiles.name,
        userEmail: profiles.email,
        userAvatar: profiles.avatar,
      })
      .from(familyMembers)
      .innerJoin(profiles, eq(familyMembers.userId, profiles.id))
      .where(eq(familyMembers.groupId, groupId))
      .orderBy(familyMembers.joinedAt);

    const children = await this.db
      .select()
      .from(familyChildren)
      .where(eq(familyChildren.groupId, groupId))
      .orderBy(familyChildren.createdAt);

    const childrenWithAge = children.map((child) => ({
      ...child,
      age: this.calculateAge(child.birthDate),
    }));

    return {
      ...group,
      members,
      children: childrenWithAge,
    };
  }
}
