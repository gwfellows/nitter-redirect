"use strict";

const HEALTH_ALARM = "nitter-health-check";
const HEALTH_PERIOD_MINUTES = 30;

const MODE_AUTO = "auto";
const MODE_MANUAL = "manual";

let nitterDisabled = false;
let instanceMode = MODE_AUTO;
let instance = ""; // The instance picked by hand, when instanceMode is manual.
let activeInstance = NITTER_DEFAULT; // What redirects actually use.
let health = {};

/* --------------------------------- state --------------------------------- */

function hasInstancePermissions() {
  return callCompat(browser.permissions.contains, browser.permissions, {
    origins: INSTANCE_ORIGINS,
  }).catch(() => false);
}

// Automatic mode uses the fastest instance that answered, and sticks with it
// until it stops answering, so a session does not hop between instances.
function resolveActiveInstance() {
  if (instanceMode === MODE_MANUAL) {
    return instance || NITTER_DEFAULT;
  }
  const ranked = rankHealthy(health);
  if (!ranked.length) {
    // No results yet, or checking is not permitted.
    return NITTER_DEFAULT;
  }
  if (ranked.some((record) => record.url === activeInstance)) {
    return activeInstance;
  }
  return ranked[0].url;
}

async function applyActiveInstance() {
  const next = resolveActiveInstance();
  if (next !== activeInstance) {
    console.info("Active Nitter instance", `"${activeInstance}"`, "=>", `"${next}"`);
    activeInstance = next;
  }
  // The content script reads this, and the popup renders it.
  await storageLocal.set({ activeInstance });
}

async function loadState() {
  const [prefs, local] = await Promise.all([
    storageSync.get(["nitterDisabled", "instance", "instanceMode"]),
    storageLocal.get(["health", "activeInstance"]),
  ]);
  nitterDisabled = Boolean(prefs.nitterDisabled);
  instance = prefs.instance || "";
  instanceMode = prefs.instanceMode || MODE_AUTO;
  health = local.health || {};
  activeInstance = local.activeInstance || NITTER_DEFAULT;
}

// One-off repair for installs from v1.1.5 and earlier, which had no mode and
// defaulted everyone to an instance that no longer resolves.
async function migrateSettings() {
  const prefs = await storageSync.get(["instance", "instanceMode"]);
  if (prefs.instanceMode) {
    return;
  }
  const stored = prefs.instance || "";
  const wasNeverChosen = !stored || stored === LEGACY_DEFAULT_INSTANCE;
  await storageSync.set({
    instanceMode: wasNeverChosen ? MODE_AUTO : MODE_MANUAL,
    instance: wasNeverChosen ? "" : stored,
  });
}

/* ------------------------------ health checks ----------------------------- */

let checkInFlight = null;

function runHealthCheck() {
  if (checkInFlight) {
    return checkInFlight;
  }
  checkInFlight = (async () => {
    if (!(await hasInstancePermissions())) {
      return health;
    }
    health = await checkAllInstances();
    await storageLocal.set({ health, lastCheck: Date.now() });
    await applyActiveInstance();
    return health;
  })().finally(() => {
    checkInFlight = null;
  });
  return checkInFlight;
}

async function scheduleHealthChecks() {
  if (await hasInstancePermissions()) {
    browser.alarms.create(HEALTH_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: HEALTH_PERIOD_MINUTES,
    });
    runHealthCheck();
  } else {
    // Permission revoked - stop checking and drop results that can no longer
    // be refreshed, rather than leaving the popup showing stale statuses.
    browser.alarms.clear(HEALTH_ALARM);
    health = {};
    await storageLocal.set({ health, lastCheck: null });
    await applyActiveInstance();
  }
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEALTH_ALARM) {
    runHealthCheck();
  }
});

// Granting the optional permission from the popup should take effect at once.
browser.permissions.onAdded.addListener(scheduleHealthChecks);
browser.permissions.onRemoved.addListener(scheduleHealthChecks);

// A navigation to the active instance that dies at the network layer is the
// earliest signal that it went down. Mark it and re-resolve, so the next
// navigation lands somewhere else rather than failing again.
browser.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.type !== "main_frame" || instanceMode !== MODE_AUTO) {
      return;
    }
    const origin = new URL(details.url).origin;
    if (origin !== activeInstance || !health[origin]) {
      return;
    }
    console.info("Instance failed to load, marking down", origin, details.error);
    health[origin] = {
      url: origin,
      latency: null,
      checkedAt: Date.now(),
      status: STATUS_DOWN,
      detail: "Failed to load",
    };
    storageLocal.set({ health });
    applyActiveInstance().then(runHealthCheck);
  },
  { urls: INSTANCE_ORIGINS }
);

/* -------------------------------- redirects ------------------------------- */

function redirectTwitter(url) {
  if (nitterDisabled) {
    return null;
  }
  if (url.host.split(".")[0] === "pbs") {
    return `${activeInstance}/pic/${encodeURIComponent(url.href)}`;
  } else if (url.host.split(".")[0] === "video") {
    return `${activeInstance}/gif/${encodeURIComponent(url.href)}`;
  } else if (url.pathname.includes("tweets")) {
    return `${activeInstance}${url.pathname.replace("/tweets", "")}${url.search}`;
  } else {
    return `${activeInstance}${url.pathname}${url.search}`;
  }
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = new URL(details.url);
    const redirect = { redirectUrl: redirectTwitter(url) };
    if (redirect.redirectUrl) {
      console.info("Redirecting", `"${url.href}"`, "=>", `"${redirect.redirectUrl}"`);
    }
    return redirect;
  },
  {
    urls: [
      "*://x.com/*",
      "*://www.x.com/*",
      "*://mobile.x.com/*",
      "*://twitter.com/*",
      "*://www.twitter.com/*",
      "*://mobile.twitter.com/*",
      "*://pbs.twimg.com/*",
      "*://video.twimg.com/*",
    ],
  },
  ["blocking"]
);

/* ------------------------------- popup wiring ----------------------------- */

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }
  if ("nitterDisabled" in changes) {
    nitterDisabled = Boolean(changes.nitterDisabled.newValue);
  }
  if ("instance" in changes) {
    instance = changes.instance.newValue || "";
  }
  if ("instanceMode" in changes) {
    instanceMode = changes.instanceMode.newValue || MODE_AUTO;
  }
  if ("instance" in changes || "instanceMode" in changes) {
    applyActiveInstance();
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "check-health") {
    runHealthCheck().then(() =>
      sendResponse({ health, activeInstance, lastCheck: Date.now() })
    );
    return true; // Response is async.
  }
  return false;
});

// The background page is persistent, so this covers install, update and startup.
(async () => {
  await migrateSettings();
  await loadState();
  await applyActiveInstance();
  scheduleHealthChecks();
})();
