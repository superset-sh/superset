#!/usr/bin/env tsx

/**
 * Seed System Roles and Permissions
 *
 * This script seeds the database with system roles and permissions.
 * Run this after initial database migration.
 *
 * Usage:
 *   pnpm tsx src/scripts/seed-roles-permissions.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RoleService, PermissionService } from '@superbuilder/features-server/role-permission';

async function bootstrap() {
  console.log('🌱 Starting role & permission seeding...\n');

  // Create NestJS application context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    // Get services from DI container
    const roleService = app.get(RoleService);
    const permissionService = app.get(PermissionService);

    // Seed permissions first
    console.log('📋 Seeding system permissions...');
    await permissionService.seedSystemPermissions();
    console.log('✅ System permissions seeded\n');

    // Seed roles
    console.log('👤 Seeding system roles...');
    await roleService.seedSystemRoles();
    console.log('✅ System roles seeded\n');

    // Verify seeding
    console.log('🔍 Verifying...');
    const roles = await roleService.getRoles({ isSystem: true });
    const permissions = await permissionService.getPermissions();

    console.log(`\n📊 Seeding Summary:`);
    console.log(`   - ${roles.length} system roles created`);
    console.log(`   - ${permissions.length} permissions created`);

    console.log('\n✨ Seeding completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
