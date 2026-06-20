// Client-side auth helpers using Supabase Auth with synthetic emails.
// User ID becomes the local-part of a synthetic email, password is stored in Auth.
import { supabase } from "@/integrations/supabase/client";

export const USERID_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

export function userIdToEmail(userId: string) {
  return `${userId.trim().toLowerCase()}@fifa.local`;
}

export async function signInWithUserId(userId: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: userIdToEmail(userId),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}
