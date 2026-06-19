import { useSession } from "@tanstack/react-start/server";

export type AdminSession = { isAdmin?: boolean; loggedInAt?: number };

export function adminSessionConfig() {
  const password = process.env.ADMIN_SESSION_SECRET;
  if (!password || password.length < 32) {
    // useSession requires a >=32 char password. Pad if user supplied something shorter.
    return {
      password: (password ?? "") + "x".repeat(Math.max(0, 32 - (password?.length ?? 0))),
      name: "fifa_admin",
      maxAge: 60 * 60 * 8,
    };
  }
  return { password, name: "fifa_admin", maxAge: 60 * 60 * 8 };
}

export async function getAdminSession() {
  return useSession<AdminSession>(adminSessionConfig());
}

export async function requireAdminOrThrow() {
  const s = await getAdminSession();
  if (!s.data?.isAdmin) {
    throw new Error("UNAUTHORIZED");
  }
}
