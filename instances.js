"use strict";

// Curated from https://status.d420.de/ and verified by hand.
// Last reviewed: 2026-08-22
const NITTER_INSTANCES = [
  "https://nitter.space",
  "https://lightbrd.com",
  "https://xcancel.com",
  "https://nitter.tiekoetter.com",
  "https://nitter.poast.org",
  "https://nitter.catsarch.com",
  "https://nitter.kareem.one",
  "https://nuku.trabun.org",
  "https://nitter.net",
];

// Used before the first health check finishes, and whenever nothing is healthy.
const NITTER_DEFAULT = NITTER_INSTANCES[0];

// Host permissions needed to health check the list above. Optional, so the
// extension keeps installing with only the Twitter/X hosts by default.
const INSTANCE_ORIGINS = NITTER_INSTANCES.map((url) => `${url}/*`);

// Shipped as the hardcoded default up to v1.1.5. Nobody picked it deliberately,
// so a stored value matching it is migrated to automatic selection rather than
// left pointing at an instance that no longer resolves for most people.
const LEGACY_DEFAULT_INSTANCE = "https://nitter.net";
