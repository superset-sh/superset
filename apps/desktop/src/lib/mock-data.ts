import type { RouterOutputs } from "@superset/api";

// Infer types from tRPC API outputs
type User = RouterOutputs["user"]["all"][number];
type Organization = RouterOutputs["organization"]["all"][number];
type Repository = RouterOutputs["repository"]["all"][number];
type Task = RouterOutputs["task"]["all"][number];

// User IDs
const SATYA_ID = "550e8400-e29b-41d4-a716-446655440001";
const KIET_ID = "550e8400-e29b-41d4-a716-446655440002";
const AVI_ID = "550e8400-e29b-41d4-a716-446655440003";

// Avatar URLs
const SATYA_AVATAR_URL = "https://avatars.githubusercontent.com/u/14907857?v=4&size=64";
const KIET_AVATAR_URL = "https://media.licdn.com/dms/image/v2/D5603AQEnhn5ucqmmHw/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1701803526901?e=1764201600&v=beta&t=qqbdPStnSKalAhqzpqkfX2BFT9YlZNrkvTPvy-IgpO0";
const AVI_AVATAR_URL = "https://pbs.twimg.com/profile_images/1971893697186086912/0ItNOuNh_400x400.jpg";

// Organization ID
const SUPERSET_ORG_ID = "550e8400-e29b-41d4-a716-446655440010";

// Repository ID
const SUPERSET_REPO_ID = "550e8400-e29b-41d4-a716-446655440020";

// Generate random dates within the last 5 days
const now = new Date();
const getRandomRecentDate = () => {
	const daysAgo = Math.floor(Math.random() * 5); // 0-4 days ago
	const hoursAgo = Math.floor(Math.random() * 24); // 0-23 hours
	const minutesAgo = Math.floor(Math.random() * 60); // 0-59 minutes
	const date = new Date(now);
	date.setDate(date.getDate() - daysAgo);
	date.setHours(date.getHours() - hoursAgo);
	date.setMinutes(date.getMinutes() - minutesAgo);
	return date;
};

// Mock Users
export const mockUsers: User[] = [
  {
    id: SATYA_ID,
    name: "Satya Patel",
    email: "satyapatel111@gmail.com",
    avatarUrl: SATYA_AVATAR_URL,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
  },
  {
    id: KIET_ID,
    name: "Kiet Ho",
    email: "hoakiet98@gmail.com",
    avatarUrl: KIET_AVATAR_URL,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
  },
  {
    id: AVI_ID,
    name: "Avi Peltz",
    email: "aj.peltz@gmail.com",
    avatarUrl: AVI_AVATAR_URL,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
  },
];

// Mock Organization (with members)
export const mockOrganization: Organization = {
  id: SUPERSET_ORG_ID,
  name: "Superset",
  slug: "SUPER",
  githubOrg: "superset-sh",
  avatarUrl: null,
  createdAt: getRandomRecentDate(),
  updatedAt: getRandomRecentDate(),
  members: [
    {
      id: "550e8400-e29b-41d4-a716-446655440030",
      organizationId: SUPERSET_ORG_ID,
      userId: SATYA_ID,
      createdAt: getRandomRecentDate(),
      user: {
        id: SATYA_ID,
        name: "Satya Patel",
        email: "satyapatel111@gmail.com",
        avatarUrl: SATYA_AVATAR_URL,
        createdAt: getRandomRecentDate(),
        updatedAt: getRandomRecentDate(),
      },
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440031",
      organizationId: SUPERSET_ORG_ID,
      userId: KIET_ID,
      createdAt: getRandomRecentDate(),
      user: {
        id: KIET_ID,
        name: "Kiet Ho",
        email: "hoakiet98@gmail.com",
        avatarUrl: KIET_AVATAR_URL,
        createdAt: getRandomRecentDate(),
        updatedAt: getRandomRecentDate(),
      },
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440032",
      organizationId: SUPERSET_ORG_ID,
      userId: AVI_ID,
      createdAt: getRandomRecentDate(),
      user: {
        id: AVI_ID,
        name: "Avi Peltz",
        email: "aj.peltz@gmail.com",
        avatarUrl: AVI_AVATAR_URL,
        createdAt: getRandomRecentDate(),
        updatedAt: getRandomRecentDate(),
      },
    },
  ],
};

// Mock Repository
export const mockRepository: Repository = {
  id: SUPERSET_REPO_ID,
  organizationId: SUPERSET_ORG_ID,
  name: "superset-sh",
  slug: "superset-sh",
  repoUrl: "https://github.com/superset-sh/superset-sh",
  repoOwner: "superset-sh",
  repoName: "superset-sh",
  defaultBranch: "main",
  createdAt: getRandomRecentDate(),
  updatedAt: getRandomRecentDate(),
  organization: {
    id: SUPERSET_ORG_ID,
    name: "Superset",
    slug: "SUPER",
    githubOrg: "superset-sh",
    avatarUrl: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
  },
};

// Mock Tasks (SUPER-1 through SUPER-10, all in backlog status)
export const mockTasks: Task[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440100",
    slug: "SUPER-1",
    title: "Set up project infrastructure",
    description: "Initialize monorepo with Bun, Turborepo, and basic configuration",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: SATYA_ID,
    creatorId: SATYA_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: SATYA_ID,
      name: "Satya Patel",
      avatarUrl: SATYA_AVATAR_URL,
    },
    creator: {
      id: SATYA_ID,
      name: "Satya Patel",
      avatarUrl: SATYA_AVATAR_URL,
    },
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440101",
    slug: "SUPER-2",
    title: "Design database schema",
    description: "Create Drizzle schema for users, organizations, repositories, and tasks",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: KIET_ID,
    creatorId: SATYA_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: KIET_ID,
      name: "Kiet Ho",
      avatarUrl: KIET_AVATAR_URL,
    },
    creator: {
      id: SATYA_ID,
      name: "Satya Patel",
      avatarUrl: SATYA_AVATAR_URL,
    },
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440102",
    slug: "SUPER-3",
    title: "Build tRPC API endpoints",
    description: "Implement type-safe API routes for all entities",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: AVI_ID,
    creatorId: KIET_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: AVI_ID,
      name: "Avi Peltz",
      avatarUrl: AVI_AVATAR_URL,
    },
    creator: {
      id: KIET_ID,
      name: "Kiet Ho",
      avatarUrl: KIET_AVATAR_URL,
    },
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440103",
    slug: "SUPER-4",
    title: "Create UI component library",
    description: "Set up shadcn/ui with TailwindCSS v4 in shared UI package",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: SATYA_ID,
    creatorId: AVI_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: SATYA_ID,
      name: "Satya Patel",
      avatarUrl: SATYA_AVATAR_URL,
    },
    creator: {
      id: AVI_ID,
      name: "Avi Peltz",
      avatarUrl: AVI_AVATAR_URL,
    },
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440104",
    slug: "SUPER-5",
    title: "Implement desktop app main process",
    description: "Build Electron main process with IPC handlers and window management",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: KIET_ID,
    creatorId: SATYA_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: KIET_ID,
      name: "Kiet Ho",
      avatarUrl: KIET_AVATAR_URL,
    },
    creator: {
      id: SATYA_ID,
      name: "Satya Patel",
      avatarUrl: SATYA_AVATAR_URL,
    },
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440105",
    slug: "SUPER-6",
    title: "Add workspace management",
    description: "Implement git worktree-based workspace system for task isolation",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: AVI_ID,
    creatorId: KIET_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: AVI_ID,
      name: "Avi Peltz",
      avatarUrl: AVI_AVATAR_URL,
    },
    creator: {
      id: KIET_ID,
      name: "Kiet Ho",
      avatarUrl: KIET_AVATAR_URL,
    },
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440106",
    slug: "SUPER-7",
    title: "Build terminal integration",
    description: "Add node-pty terminal sessions with proper IPC communication",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: SATYA_ID,
    creatorId: AVI_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: SATYA_ID,
      name: "Satya Patel",
      avatarUrl: SATYA_AVATAR_URL,
    },
    creator: {
      id: AVI_ID,
      name: "Avi Peltz",
      avatarUrl: AVI_AVATAR_URL,
    },
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440107",
    slug: "SUPER-8",
    title: "Implement authentication system",
    description: "Set up user authentication with session management",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: KIET_ID,
    creatorId: SATYA_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: KIET_ID,
      name: "Kiet Ho",
      avatarUrl: KIET_AVATAR_URL,
    },
    creator: {
      id: SATYA_ID,
      name: "Satya Patel",
      avatarUrl: SATYA_AVATAR_URL,
    },
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440108",
    slug: "SUPER-9",
    title: "Create task management UI",
    description: "Build kanban board and task detail views with drag-and-drop",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: AVI_ID,
    creatorId: KIET_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: AVI_ID,
      name: "Avi Peltz",
      avatarUrl: AVI_AVATAR_URL,
    },
    creator: {
      id: KIET_ID,
      name: "Kiet Ho",
      avatarUrl: KIET_AVATAR_URL,
    },
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440109",
    slug: "SUPER-10",
    title: "Add keyboard shortcuts system",
    description: "Implement Arc-style keyboard shortcuts for navigation and actions",
    status: "backlog",
    repositoryId: SUPERSET_REPO_ID,
    organizationId: SUPERSET_ORG_ID,
    assigneeId: SATYA_ID,
    creatorId: AVI_ID,
    branch: null,
    createdAt: getRandomRecentDate(),
    updatedAt: getRandomRecentDate(),
    assignee: {
      id: SATYA_ID,
      name: "Satya Patel",
      avatarUrl: SATYA_AVATAR_URL,
    },
    creator: {
      id: AVI_ID,
      name: "Avi Peltz",
      avatarUrl: AVI_AVATAR_URL,
    },
  },
];
