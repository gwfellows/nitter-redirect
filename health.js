"use strict";

// Probing a real profile exercises the Twitter API path, so an instance that
// serves its front page but is rate limited still reads as unhealthy.
const PROBE_PATH = "/jack";
const PROBE_TIMEOUT_MS = 8000;

// Instances behind Anubis or Cloudflare answer a bare fetch with an interstitial
// that a real browser clears on its own, so they count as reachable - just
// ranked below instances that answer straight away.
const CHALLENGE_MARKERS = [
  "anubis",
  "not a bot",
  "just a moment",
  "verifying your browser",
  "checking your browser",
  "cloudflare",
];

// Nitter renders these when it is up but cannot talk to Twitter.
const FAILURE_MARKERS = [
  "instance has been rate limited",
  "error-panel",
];

// A served profile always contains both of these.
const CONTENT_MARKERS = ["profile-card", "timeline-item"];

const STATUS_OK = "ok";
const STATUS_CHALLENGED = "challenged";
const STATUS_DOWN = "down";

function includesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

function classifyBody(status, body) {
  const text = body.toLowerCase();
  // Checked first: a page that actually renders tweets is healthy no matter
  // what other words happen to appear in it.
  if (status < 400 && CONTENT_MARKERS.every((marker) => text.includes(marker))) {
    return { status: STATUS_OK, detail: "Serving tweets" };
  }
  if (includesAny(text, CHALLENGE_MARKERS)) {
    return { status: STATUS_CHALLENGED, detail: "Challenge page - browser can clear it" };
  }
  if (status < 200 || status >= 400) {
    return { status: STATUS_DOWN, detail: `HTTP ${status}` };
  }
  if (includesAny(text, FAILURE_MARKERS)) {
    return { status: STATUS_DOWN, detail: "Rate limited or erroring" };
  }
  return { status: STATUS_DOWN, detail: "Not serving Nitter content" };
}

async function checkInstance(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${url}${PROBE_PATH}`, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await response.text();
    const latency = Date.now() - startedAt;
    return { url, latency, checkedAt: Date.now(), ...classifyBody(response.status, body) };
  } catch (error) {
    return {
      url,
      latency: null,
      checkedAt: Date.now(),
      status: STATUS_DOWN,
      detail: error.name === "AbortError" ? "Timed out" : "Unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}

function checkAllInstances() {
  return Promise.all(NITTER_INSTANCES.map(checkInstance)).then((results) =>
    results.reduce((health, result) => {
      health[result.url] = result;
      return health;
    }, {})
  );
}

// Instances that answered, best first: unchallenged before challenged, then by
// latency. Callers pick the head of this list.
function rankHealthy(health) {
  return NITTER_INSTANCES.map((url) => health[url])
    .filter((record) => record && record.status !== STATUS_DOWN)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === STATUS_OK ? -1 : 1;
      return (a.latency ?? Infinity) - (b.latency ?? Infinity);
    });
}
