"use strict";

let nitterDisabled;
let instance;

function redirectTwitter(url) {
  if (url.host.split(".")[0] === "pbs") {
    return `${instance}/pic/${encodeURIComponent(url.href)}`;
  } else if (url.host.split(".")[0] === "video") {
    return `${instance}/gif/${encodeURIComponent(url.href)}`;
  } else if (url.pathname.includes("tweets")) {
    return `${instance}${url.pathname.replace("/tweets", "")}${url.search}`;
  } else {
    return `${instance}${url.pathname}${url.search}`;
  }
}

Promise.all([
  storageSync.get(["nitterDisabled"]),
  storageLocal.get(["activeInstance"]),
]).then(([prefs, local]) => {
  nitterDisabled = prefs.nitterDisabled;
  // The background page resolves this from the mode, the manual choice and the
  // latest health check, so the content script just follows its lead.
  instance = local.activeInstance || NITTER_DEFAULT;

  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      if (
        registration.scope === "https://twitter.com/" ||
        registration.scope === "https://x.com/"
      ) {
        registration.unregister();
        console.log("Unregistered Twitter SW", registration);
      }
    }
  });

  const url = new URL(window.location);
  if (!nitterDisabled && url.origin !== instance) {
    const redirect = redirectTwitter(url);
    console.info("Redirecting", `"${url.href}"`, "=>", `"${redirect}"`);
    window.location = redirect;
  }
});
