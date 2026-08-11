# Frume support site

Static Apple-facing support and privacy pages for Frume. The site has no
runtime dependencies, analytics, cookies, remote fonts, or client scripts.

## Verify

```sh
node check.mjs
```

The check covers the two HTML entry points, required accessibility landmarks,
local links, the release contact marker, and the no-script Content Security
Policy.

## Deploy to Vercel

Use `support-site` as the Vercel project root with the **Other** framework
preset. No build command or environment variables are required.
`vercel.json` serves only the `public` directory, keeping release notes and
checks out of the public site. Clean trailing-slash routes are configured as:

- `/` — support
- `/privacy/` — privacy policy

Run `node check.mjs`, deploy a preview, inspect both pages at narrow and wide
viewport sizes, then promote the reviewed deployment. The final production
domain must be copied into the app's `EXPO_PUBLIC_SUPPORT_URL` and
`EXPO_PUBLIC_PRIVACY_URL` release values.

## Release contact

`targix8@gmail.com` was verified as public on the legacy Frume privacy page on
2026-07-31. It is the current release contact, not an invented placeholder.
Every HTML occurrence is accompanied by a `RELEASE_CONTACT` source comment.

If the release owner approves a replacement address, update the visible text
and `mailto:` targets in both pages, update `releaseContact` in `check.mjs`,
and run the check before deployment. Do not publish a different address
without that approval.
