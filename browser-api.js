"use strict";

window.browser = window.browser || window.chrome;

// Firefox's `browser.*` APIs return promises; Chrome's `chrome.*` APIs take a
// callback and throw when one is missing. Try the promise form, fall back to
// the callback form, so the rest of the code can just await everything.
function callCompat(fn, thisArg, ...args) {
  try {
    const result = fn.apply(thisArg, args);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch (error) {
    // Callback-only implementation - fall through.
  }
  return new Promise((resolve) => fn.apply(thisArg, [...args, resolve]));
}

const storageSync = {
  get: (keys) => callCompat(browser.storage.sync.get, browser.storage.sync, keys),
  set: (items) => callCompat(browser.storage.sync.set, browser.storage.sync, items),
};

const storageLocal = {
  get: (keys) => callCompat(browser.storage.local.get, browser.storage.local, keys),
  set: (items) => callCompat(browser.storage.local.set, browser.storage.local, items),
};
