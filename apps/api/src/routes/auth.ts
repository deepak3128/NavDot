import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";
import { supabase } from "../supabase";

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
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data.user) {
      return res.status(500).json({ error: "Registration failed" });
    }

    return res.status(201).json({
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
        fullName: (data.user.user_metadata as { full_name?: string } | undefined)?.full_name ?? null,
        createdAt: data.user.created_at ?? new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const { email, password } = result.data;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  if (!data.session || !data.user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  return res.json({
    token: data.session.access_token,
    user: {
      id: data.user.id,
      email: data.user.email ?? email,
      fullName: (data.user.user_metadata as { full_name?: string } | undefined)?.full_name ?? null
    }
  });
});

router.get("/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return res.json({
    user: {
      id: req.auth.userId,
      email: req.auth.email,
      fullName: req.auth.fullName ?? null,
      createdAt: req.auth.createdAt ?? new Date().toISOString()
    }
  });
});

export default router;
