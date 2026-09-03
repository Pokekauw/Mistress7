/* DOMINION ⛓️ — service worker: web push + focus handling */

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

/* Payload sent by the push server:
   { "title": "⛓️ A decree", "body": "Kneel.", "url": "/#/sub" }        */
self.addEventListener("push", (event) => {
  let data = { title: "⛓️ Dominion", body: "Your Mistress requires you.", url: "/#/sub" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/mistress.png",
      badge: "/mistress.png",
      tag: data.tag || "dominion",
      renotify: true,
      vibrate: [120, 60, 120],
      requireInteraction: Boolean(data.urgent),
      data: { url: data.url || "/#/sub" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/#/sub";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
