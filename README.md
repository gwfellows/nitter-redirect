# ![nitter-redirect](images/icon32.png) Nitter Redirect

[![Donate](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/SimonBrazell/donate) [![Buy me a coffee](images/buy-me-a-coffee.png)](https://www.buymeacoffee.com/SimonBrazell)

[![Firefox Add-on](images/badge-amo.png)](https://addons.mozilla.org/en-US/firefox/addon/nitter-redirect/) [![Chrome Extension](images/badge-chrome.png)](https://chrome.google.com/webstore/detail/nitter-redirect/mohaicophfnifehkkkdbcejkflmgfkof)

A simple browser extension that redirects Twitter and X requests to [Nitter](https://github.com/zedeus/nitter) instead.

No unnecessary permissions required, only listens for and redirects requests made to `x.com`, `www.x.com`, `mobile.x.com`, `twitter.com`, `www.twitter.com`, `mobile.twitter.com`, `pbs.twimg.com` & `video.twimg.com`, nothing else.

Allows for setting custom [Nitter instances](https://github.com/zedeus/nitter/wiki/Instances) and toggling redirects on & off.

## Choosing an instance

Public Nitter instances come and go, so the popup offers three ways to pick one:

- **Automatic** (default) — periodically checks the instances the extension ships with and redirects to the fastest one that is actually serving tweets, sticking with it until it stops responding.
- **Pick an instance** — choose from the shipped list, annotated with its last known status.
- **Custom URL** — point at any instance you like. Custom instances are not health checked.

Automatic selection and the status list need to contact those instances, which is an **optional** permission: it is not requested at install time, and the extension falls back to the manual list if you decline. Grant it from the popup when you first select Automatic.

Instances behind an Anubis or Cloudflare interstitial are shown as working with an extra check on load, and are ranked below instances that answer directly — your browser clears those challenges on its own, but a background check cannot.

Clicking a link that points straight at one of the shipped instances (a bookmark, a shared URL) is covered too: if that instance is known to be down, the extension redirects you to whichever instance it currently trusts instead of letting the navigation fail. This only applies to instances on the shipped list, and requires the same optional permission as Automatic mode.

## Build

1.  `npm install --global web-ext`
2.  `web-ext build`
3.  See `web-ext-artifacts/` for outputs.

## License

Code released under [the MIT license](LICENSE.txt).
