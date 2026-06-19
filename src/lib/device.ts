const KEY = "fifa_pred_device_id_v1";
const NAME_KEY = "fifa_pred_username_v1";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id =
      (crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`) +
      "-" +
      Math.random().toString(36).slice(2, 8);
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export function getStoredUsername(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(NAME_KEY);
}

export function setStoredUsername(name: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NAME_KEY, name);
}
