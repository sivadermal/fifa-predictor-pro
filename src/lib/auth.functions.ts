import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const USERID_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

const signUpSchema = z.object({
  userId: z.string().regex(USERID_RE, "User ID must be 3-24 chars: letters, numbers, _ . -"),
  name: z.string().trim().min(2).max(40),
  password: z.string().min(6).max(72),
});

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((input) => signUpSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = `${data.userId.toLowerCase()}@fifa.local`;

    // Pre-check uniqueness on profile.user_id (case-insensitive).
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("user_id", data.userId)
      .maybeSingle();
    if (existing) throw new Error("USERID_TAKEN");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, user_id: data.userId },
    });
    if (error || !created.user) {
      if (error?.message?.toLowerCase().includes("already")) throw new Error("USERID_TAKEN");
      throw error ?? new Error("SIGNUP_FAILED");
    }

    const { error: profErr } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      user_id: data.userId,
      name: data.name,
    });
    if (profErr) {
      // rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      if (profErr.message?.toLowerCase().includes("duplicate")) throw new Error("USERID_TAKEN");
      throw profErr;
    }

    return { ok: true, userId: data.userId, name: data.name };
  });
