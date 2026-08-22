"use strict";

const MODE_AUTO = "auto";
const MODE_MANUAL = "manual";
const MODE_CUSTOM = "custom";

const STATUS_LABELS = {
  ok: "Working",
  challenged: "Working (extra check on load)",
  down: "Down",
};

const toggleNitter = document.querySelector("#toggle-nitter");
const version = document.querySelector("#version");
const modeSelect = document.querySelector("#instance-mode");
const autoPanel = document.querySelector("#auto-panel");
const manualPanel = document.querySelector("#manual-panel");
const customPanel = document.querySelector("#custom-panel");
const instanceSelect = document.querySelector("#instance-select");
const customInstance = document.querySelector("#instance");
const activeLine = document.querySelector("#active-instance");
const permissionPrompt = document.querySelector("#permission-prompt");
const grantButton = document.querySelector("#grant-permission");
const healthSection = document.querySelector("#health-section");
const healthList = document.querySelector("#health-list");
const lastCheckLabel = document.querySelector("#last-check");
const checkNowButton = document.querySelector("#check-now");

let state = {
  mode: MODE_AUTO,
  instance: "",
  activeInstance: NITTER_DEFAULT,
  health: {},
  lastCheck: null,
  hasPermission: false,
};

version.textContent = browser.runtime.getManifest().version;

/* -------------------------------- rendering ------------------------------- */

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch (error) {
    return url;
  }
}

function describe(record) {
  if (!record) return "Not checked";
  const label = STATUS_LABELS[record.status] || record.status;
  return record.latency === null ? label : `${label} · ${record.latency} ms`;
}

function statusClass(record) {
  return `status status-${record ? record.status : "unknown"}`;
}

function renderHealthList() {
  healthList.textContent = "";
  NITTER_INSTANCES.forEach((url) => {
    const record = state.health[url];
    const item = document.createElement("li");
    if (url === state.activeInstance) {
      item.classList.add("current");
    }

    const dot = document.createElement("span");
    dot.className = statusClass(record);
    item.appendChild(dot);

    const name = document.createElement("span");
    name.className = "host";
    name.textContent = hostOf(url);
    item.appendChild(name);

    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = describe(record);
    item.appendChild(detail);

    healthList.appendChild(item);
  });
}

function renderInstanceSelect() {
  const previous = state.instance;
  instanceSelect.textContent = "";
  NITTER_INSTANCES.forEach((url) => {
    const record = state.health[url];
    const option = document.createElement("option");
    option.value = url;
    option.textContent = `${hostOf(url)} — ${describe(record)}`;
    instanceSelect.appendChild(option);
  });
  instanceSelect.value = NITTER_INSTANCES.includes(previous)
    ? previous
    : state.activeInstance;
}

function renderActiveLine() {
  const record = state.health[state.activeInstance];
  activeLine.textContent = `Using ${hostOf(state.activeInstance)}`;
  if (record && record.latency !== null) {
    activeLine.textContent += ` · ${record.latency} ms`;
  } else if (!state.hasPermission) {
    activeLine.textContent += " · built-in default";
  }
}

function renderLastCheck() {
  if (!state.lastCheck) {
    lastCheckLabel.textContent = state.hasPermission
      ? "Not checked yet"
      : "Checks not allowed";
    return;
  }
  const minutes = Math.round((Date.now() - state.lastCheck) / 60000);
  lastCheckLabel.textContent =
    minutes < 1 ? "Checked just now" : `Checked ${minutes} min ago`;
}

function render() {
  modeSelect.value = state.mode;
  autoPanel.hidden = state.mode !== MODE_AUTO;
  manualPanel.hidden = state.mode !== MODE_MANUAL;
  customPanel.hidden = state.mode !== MODE_CUSTOM;

  // A custom instance is never checked, so neither control applies there.
  permissionPrompt.hidden = state.hasPermission || state.mode === MODE_CUSTOM;
  healthSection.hidden = state.mode === MODE_CUSTOM;
  checkNowButton.disabled = !state.hasPermission;

  renderActiveLine();
  renderInstanceSelect();
  renderHealthList();
  renderLastCheck();
}

/* ---------------------------------- state --------------------------------- */

function hasInstancePermissions() {
  return callCompat(browser.permissions.contains, browser.permissions, {
    origins: INSTANCE_ORIGINS,
  }).catch(() => false);
}

async function load() {
  const [prefs, local, hasPermission] = await Promise.all([
    storageSync.get(["nitterDisabled", "instance", "instanceMode"]),
    storageLocal.get(["health", "activeInstance", "lastCheck"]),
    hasInstancePermissions(),
  ]);

  toggleNitter.checked = !prefs.nitterDisabled;

  const storedInstance = prefs.instance || "";
  const storedMode = prefs.instanceMode || MODE_AUTO;
  // "manual" covers both a listed instance and a custom URL; the popup splits
  // them so the two controls stay unambiguous.
  const isCustom =
    storedMode === MODE_MANUAL && storedInstance && !NITTER_INSTANCES.includes(storedInstance);

  state = {
    mode: isCustom ? MODE_CUSTOM : storedMode,
    instance: storedInstance,
    activeInstance: local.activeInstance || NITTER_DEFAULT,
    health: local.health || {},
    lastCheck: local.lastCheck || null,
    hasPermission,
  };

  customInstance.value = isCustom ? storedInstance : "";
  render();
}

async function saveMode(mode) {
  if (mode === MODE_AUTO) {
    await storageSync.set({ instanceMode: MODE_AUTO });
  } else if (mode === MODE_MANUAL) {
    await storageSync.set({
      instanceMode: MODE_MANUAL,
      instance: instanceSelect.value || NITTER_DEFAULT,
    });
  } else {
    await storageSync.set({
      instanceMode: MODE_MANUAL,
      instance: customInstance.value ? new URL(customInstance.value).origin : "",
    });
  }
}

/* -------------------------------- listeners ------------------------------- */

toggleNitter.addEventListener("change", (event) => {
  storageSync.set({ nitterDisabled: !event.target.checked });
});

modeSelect.addEventListener("change", (event) => {
  state.mode = event.target.value;
  // Requested before anything awaits, because Firefox only allows the prompt
  // while the user gesture that triggered it is still on the stack.
  if (state.mode === MODE_AUTO && !state.hasPermission) {
    requestPermission();
  }
  render();
  saveMode(state.mode);
});

instanceSelect.addEventListener("change", (event) => {
  state.instance = event.target.value;
  state.activeInstance = event.target.value;
  storageSync.set({ instanceMode: MODE_MANUAL, instance: event.target.value });
  render();
});

function debounce(func, wait) {
  let timeout;
  return function () {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

customInstance.addEventListener(
  "input",
  debounce(() => {
    if (customInstance.checkValidity()) {
      storageSync.set({
        instanceMode: MODE_MANUAL,
        instance: customInstance.value ? new URL(customInstance.value).origin : "",
      });
    }
  }, 500)
);

function requestPermission() {
  callCompat(browser.permissions.request, browser.permissions, {
    origins: INSTANCE_ORIGINS,
  })
    .then((granted) => {
      state.hasPermission = Boolean(granted);
      render();
      if (granted) {
        checkNow();
      }
    })
    .catch((error) => console.warn("Permission request failed", error));
}

grantButton.addEventListener("click", requestPermission);

function checkNow() {
  checkNowButton.disabled = true;
  lastCheckLabel.textContent = "Checking…";
  callCompat(browser.runtime.sendMessage, browser.runtime, {
    type: "check-health",
  })
    .then((response) => {
      if (response) {
        state.health = response.health || {};
        state.activeInstance = response.activeInstance || state.activeInstance;
        state.lastCheck = response.lastCheck || Date.now();
      }
    })
    .catch((error) => console.warn("Health check failed", error))
    .then(render);
}

checkNowButton.addEventListener("click", checkNow);

load();
