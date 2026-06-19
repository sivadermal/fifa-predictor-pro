import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { registerUser, getMe } from "@/lib/predictions.functions";
import { getDeviceId, getStoredUsername, setStoredUsername } from "@/lib/device";

type Profile = {
  id: string;
  username: string;
  disabled: boolean;
} | null;

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(null);
  const [ready, setReady] = useState(false);
  const fetchMe = useServerFn(getMe);

  useEffect(() => {
    const deviceId = getDeviceId();
    if (!deviceId) { setReady(true); return; }
    fetchMe({ data: { deviceId } })
      .then((p) => {
        if (p) {
          setProfile({ id: p.id, username: p.username, disabled: p.disabled });
          setStoredUsername(p.username);
        }
      })
      .finally(() => setReady(true));
  }, [fetchMe]);

  return { profile, setProfile, ready };
}

export function UsernameGate({
  profile,
  onRegistered,
  children,
}: {
  profile: Profile;
  onRegistered: (p: NonNullable<Profile>) => void;
  children: React.ReactNode;
}) {
  const [name, setName] = useState(getStoredUsername() ?? "");
  const register = useServerFn(registerUser);
  const mut = useMutation({
    mutationFn: (username: string) =>
      register({ data: { username, deviceId: getDeviceId() } }),
    onSuccess: (data) => {
      setStoredUsername(data.username);
      onRegistered({ id: data.id, username: data.username, disabled: data.disabled });
      toast.success(data.isNew ? `Welcome, ${data.username}!` : `Welcome back, ${data.username}!`);
    },
    onError: (err: Error) => {
      if (err.message === "USERNAME_TAKEN") {
        toast.error("This username is already taken. Please choose another username.");
      } else {
        toast.error(err.message || "Could not register");
      }
    },
  });

  if (profile) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md">
      <div className="pitch-card p-6">
        <h1 className="text-2xl font-bold">Pick your name</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This name will be permanently linked to this device. You won't be able to change it later.
        </p>
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed.length < 2) {
              toast.error("Username must be at least 2 characters");
              return;
            }
            mut.mutate(trimmed);
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dathan"
            maxLength={24}
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={mut.isPending}>
            {mut.isPending ? "Saving..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
