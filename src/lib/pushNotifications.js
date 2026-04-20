import { supabase } from "../supabaseClient";
import { invokeSupabaseFunction } from "./supabaseFunctions";

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(normalized);

  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
};

export const isPushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const registerReminderServiceWorker = async () => {
  if (!isPushSupported()) {
    return null;
  }

  return navigator.serviceWorker.register("/service-worker.js");
};

export const syncPushSubscription = async ({ forcePermissionPrompt = false } = {}) => {
  if (!isPushSupported()) {
    return { supported: false, subscribed: false };
  }

  const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim();

  if (!publicKey) {
    return { supported: true, subscribed: false, configured: false };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If not signed in, avoid hitting the function (prevents 401 spam).
  if (!session?.access_token) {
    return { supported: true, subscribed: false, configured: true, permission: Notification.permission };
  }

  const registration = await registerReminderServiceWorker();

  if (!registration) {
    return { supported: true, subscribed: false };
  }

  let permission = Notification.permission;

  if (forcePermissionPrompt && permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    const existingSubscription = await registration.pushManager.getSubscription();

    if (existingSubscription) {
      try {
        await invokeSupabaseFunction("push-subscriptions", {
          action: "unsubscribe",
          subscription: existingSubscription.toJSON(),
        });
      } catch {
        // ignore unsubscribe failures; still try to clean up locally
      }
      await existingSubscription.unsubscribe().catch(() => {});
    }

    return {
      supported: true,
      subscribed: false,
      permission,
      configured: true,
    };
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  // Persist subscription server-side so dispatch-reminders can send pushes.
  await invokeSupabaseFunction("push-subscriptions", {
    action: "subscribe",
    subscription: subscription.toJSON(),
  });

  return {
    supported: true,
    subscribed: true,
    permission,
    configured: true,
  };
};
