import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { signInWithUserId, USERID_RE } from "@/lib/auth";
import { signUp } from "@/lib/auth.functions";

export type AppUser = {
  id: string;
  userId: string;
  name: string;
};

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

export function useAppUser(session: Session | null): AppUser | null {
  if (!session?.user) return null;
  const meta = session.user.user_metadata ?? {};
  return {
    id: session.user.id,
    userId: (meta.user_id as string) ?? session.user.email?.split("@")[0] ?? "",
    name: (meta.name as string) ?? "Player",
  };
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, ready } = useSession();
  if (!ready) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  if (!session) return <AuthScreen />;
  return <>{children}</>;
}

function AuthScreen() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  return (
    <div className="mx-auto mt-6 max-w-md">
      <div className="pitch-card p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground text-xl">⚽</span>
          <div>
            <h1 className="text-xl font-bold leading-tight">FIFA <span className="gold-text">Predictor</span></h1>
            <p className="text-xs text-muted-foreground">Predict winners. Climb the table.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-lg border border-border/60 p-1">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === "signin" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
            onClick={() => setTab("signin")}
          >
            Sign in
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === "signup" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
            onClick={() => setTab("signup")}
          >
            Create account
          </button>
        </div>

        {tab === "signin" ? <SignInForm /> : <SignUpForm onDone={() => setTab("signin")} />}
      </div>
    </div>
  );
}

function SignInForm() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const mut = useMutation({
    mutationFn: () => signInWithUserId(userId.trim(), password),
    onSuccess: () => toast.success("Welcome back!"),
    onError: (e: Error) =>
      toast.error(
        /invalid/i.test(e.message) ? "Invalid User ID or password" : e.message,
      ),
  });
  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!USERID_RE.test(userId.trim())) return toast.error("Invalid User ID format");
        if (password.length < 6) return toast.error("Password must be 6+ characters");
        mut.mutate();
      }}
    >
      <div>
        <Label>User ID</Label>
        <Input value={userId} onChange={(e) => setUserId(e.target.value)} autoFocus autoCapitalize="none" autoCorrect="off" />
      </div>
      <div>
        <Label>Password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={mut.isPending}>
        {mut.isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const signUpFn = useServerFn(signUp);
  const mut = useMutation({
    mutationFn: async () => {
      await signUpFn({ data: { userId: userId.trim(), name: name.trim(), password } });
      return signInWithUserId(userId.trim(), password);
    },
    onSuccess: () => toast.success(`Welcome, ${name.trim()}!`),
    onError: (e: Error) => {
      if (e.message === "USERID_TAKEN") {
        toast.error("This User ID is already taken. Please choose another.");
      } else {
        toast.error(e.message);
      }
      onDone();
    },
  });
  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!USERID_RE.test(userId.trim())) return toast.error("User ID: 3-24 chars, letters/numbers/_.-");
        if (name.trim().length < 2) return toast.error("Enter your name");
        if (password.length < 6) return toast.error("Password must be 6+ characters");
        mut.mutate();
      }}
    >
      <div>
        <Label>User ID</Label>
        <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="e.g. dathan23" autoCapitalize="none" autoCorrect="off" />
        <p className="mt-1 text-xs text-muted-foreground">Used for login. Must be unique.</p>
      </div>
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
      </div>
      <div>
        <Label>Password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6+ characters" />
      </div>
      <Button type="submit" className="w-full" disabled={mut.isPending}>
        {mut.isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
