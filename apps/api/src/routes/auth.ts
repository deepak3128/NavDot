import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";
import { createUser, findUserByEmail, findUserProfileById } from "../authStore";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

router.post("/register", async (req, res) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const { email, password, fullName } = result.data;

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await createUser(email, passwordHash, fullName);
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      return res.status(409).json({ error: "Email already registered" });
    }
    throw error;
  }

  return res.status(201).json({ user });
});

router.post("/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const { email, password } = result.data;
  const user = await findUserByEmail(email);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? undefined : "navdot-dev-secret");
  if (!secret) {
    return res.status(500).json({ error: "JWT secret not configured" });
  }

  const token = jwt.sign({ sub: user.id, email: user.email }, secret, { expiresIn: "7d" });

  return res.json({
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName }
  });
});

router.get("/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await findUserProfileById(req.userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({ user });
});

export default router;
