import type { NextFunction, Request, Response } from "express";
import { supabase } from "./supabase.js";

export interface AuthedUser {
  id: string;
  email: string | null;
  is_admin: boolean;
  is_allowed: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/**
 * Verifies the Supabase JWT and attaches { id, email, is_admin, is_allowed }
 * to req.user. Does NOT 403 on its own — downstream middleware decides.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthenticated" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: "invalid token" });
  }

  const id = data.user.id;
  const email = data.user.email ?? null;

  const [profileRes, allowedRes] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", id).maybeSingle(),
    email
      ? supabase
          .from("allowed_emails")
          .select("id")
          .ilike("email", email)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  req.user = {
    id,
    email,
    is_admin: profileRes.data?.is_admin === true,
    is_allowed:
      profileRes.data?.is_admin === true || allowedRes.data != null,
  };
  next();
}

export function requireAllowed(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  if (!req.user.is_allowed) {
    return res.status(403).json({
      error: "not_allowed",
      message:
        "Your email isn't on the allowlist. Ask an admin to add you.",
    });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  if (!req.user.is_admin) {
    return res.status(403).json({ error: "admin_required" });
  }
  next();
}
