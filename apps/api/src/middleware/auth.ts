import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../types";
import { supabase } from "../supabase";

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.auth = {
      userId: data.user.id,
      email: data.user.email ?? "",
      fullName: (data.user.user_metadata as { full_name?: string } | undefined)?.full_name ?? null,
      createdAt: data.user.created_at ?? undefined
    };

    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
