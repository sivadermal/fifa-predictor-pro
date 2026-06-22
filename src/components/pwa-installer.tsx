import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVapidPublicKey, savePushSubscription } from "@/lib/push.functions";
import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Registers the service worker, then (if the user is signed in) prompts for
 * notification permission once and saves a Web Push subscription.
 */
export function PwaInstaller() {
  const getKey = useServerFn(getVapidPublicKey);
  const saveSub = useServerFn(savePushSubscription);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");

        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) return;
        if (!("PushManager" in window) || !("Notification" in window)) return;

        // Only ask once per browser per user gesture is ideal, but most browsers
        // accept a permission prompt right after SW registration on first load.
        let perm = Notification.permission;
        if (perm === "default") {
          try {
            perm = await Notification.requestPermission();
          } catch {
            perm = Notification.permission;
          }
        }
        if (perm !== "granted") return;

        const { key } = await getKey();
        if (!key) return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key),
          });
        }
        const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
        await saveSub({
          data: {
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        });
      } catch (_e) {
        // best-effort; silent
      }
    })();
  }, [getKey, saveSub]);

  return null;
}
