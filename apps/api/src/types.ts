import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    email: string;
    fullName?: string | null;
    createdAt?: string;
  };
}
