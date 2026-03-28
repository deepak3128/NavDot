import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";

type LocalUser = {
  id: string;
  email: string;
  passwordHash: string;
  fullName?: string;
  createdAt: string;
  updatedAt: string;
};

type PublicUser = {
  id: string;
  email: string;
  fullName?: string | null;
  createdAt: Date;
};

type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  fullName?: string | null;
  createdAt: Date;
};

const localDbDir = path.resolve(process.cwd(), "data");
const localUsersFile = path.join(localDbDir, "users.json");

async function ensureLocalStore(): Promise<void> {
  await fs.mkdir(localDbDir, { recursive: true });
  try {
    await fs.access(localUsersFile);
  } catch {
    await fs.writeFile(localUsersFile, "[]", "utf8");
  }
}

async function readLocalUsers(): Promise<LocalUser[]> {
  await ensureLocalStore();
  const content = await fs.readFile(localUsersFile, "utf8");
  try {
    const parsed = JSON.parse(content) as LocalUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalUsers(users: LocalUser[]): Promise<void> {
  await ensureLocalStore();
  await fs.writeFile(localUsersFile, JSON.stringify(users, null, 2), "utf8");
}

function toAuthUser(user: LocalUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    fullName: user.fullName ?? null,
    createdAt: new Date(user.createdAt)
  };
}

function toPublicUser(user: LocalUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName ?? null,
    createdAt: new Date(user.createdAt)
  };
}

async function findLocalUserByEmail(email: string): Promise<LocalUser | null> {
  const users = await readLocalUsers();
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

async function findLocalUserById(id: string): Promise<LocalUser | null> {
  const users = await readLocalUsers();
  return users.find((user) => user.id === id) ?? null;
}

async function createLocalUser(email: string, passwordHash: string, fullName?: string): Promise<LocalUser> {
  const users = await readLocalUsers();
  const now = new Date().toISOString();
  const user: LocalUser = {
    id: `local_${randomUUID()}`,
    email,
    passwordHash,
    fullName,
    createdAt: now,
    updatedAt: now
  };

  users.push(user);
  await writeLocalUsers(users);
  return user;
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      fullName: user.fullName,
      createdAt: user.createdAt
    };
  } catch {
    const localUser = await findLocalUserByEmail(email);
    return localUser ? toAuthUser(localUser) : null;
  }
}

export async function createUser(email: string, passwordHash: string, fullName?: string): Promise<PublicUser> {
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, fullName },
      select: { id: true, email: true, fullName: true, createdAt: true }
    });

    return user;
  } catch {
    const existing = await findLocalUserByEmail(email);
    if (existing) {
      throw new Error("EMAIL_EXISTS");
    }

    const user = await createLocalUser(email, passwordHash, fullName);
    return toPublicUser(user);
  }
}

export async function findUserProfileById(userId: string): Promise<PublicUser | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, createdAt: true }
    });
    return user;
  } catch {
    const user = await findLocalUserById(userId);
    return user ? toPublicUser(user) : null;
  }
}
