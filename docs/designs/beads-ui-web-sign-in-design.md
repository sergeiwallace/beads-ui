---
title: "Beads UI Web Sign-in"
category: design
tags: [design]
status: draft
source: "aido-stub"
template_version: "design-1.0.0"
delegation_provenance:
  version: 2
  contributors: []
task: BU-ute
---

# Beads UI Web Sign-in

## Founding Ask Coverage

`founding_ask_ref`: N/A (Tier 0 bounded design stage. The original request is recorded on BU-ute.)

This coverage index maps the excerpts supplied for this stage. The task record is authoritative.

| Supplied excerpt | Coverage |
| --- | --- |
| “the usability of this beads-ui app is a pain in the ass if i have to refresh or restart teh server. we need to figure out how to make this persist with a secret or session credential or cache or something.” | [Persistent sessions](#d-1) and [tailnet sign-in](#d-2). |
| “a button or something that is secure that i can click to do like 2FA or something ... i can register a 2FA code to my authy app on my mobile phone.” | [Authenticator sign-in and recovery](#d-3). |
| “should we have a skill added to /beadss-ui web app and also installed in ai-harness repo via the beads-ui plugin installed for all my projects / account wide”. | [Sign-in help and icons](#d-4) and [account-wide distribution constraint](#conflicts-found). |

The library-adoption follow-up was supplied verbatim without its canonical root. Its scope here is the sign-in design. The [responsive-shell research coverage](../research/beads-ui-ui-libraries-and-responsive-shell.md#founding-ask-coverage) maps the full request.

```text
also, a bug i see that you should /handoff to ava to /handoff to the aih-ec2 ccs ession working on beads-ui web app (i think its lou, right? if you know whom it is, just /handoff to them directly) is that the top menu bar at 100% zoom (default) on my macbook air m3 13" has the "sign out" button or whatever overflow onto a second line and so the sign out button appears on the left side on a second row instad of a single row for the top menu bar. it should always be resized / reformatted etc to always be a signle bar no matter what zoom level. and if it can't fit in all the buttons in high zoom (some minimum size / font etc threshold or something, whtever is best practice / industry standard for how frontend web design works or handles this with zooming and resizing / reformatting dynamically and automatically, and ideally we can use some framework or something for this), then it can just collapse the top buttons / options etc on the right side of the menu bar into a collapse options drop down that you can select to see all the hidden collapsed menu bar options. same with side bar when we do that. it should just auto-convert to a icon (like the more options icon or something, whatever tends to be used for this for best practice / industry standard web design / UI / UX for menu bar options and side bar options and zooming and auto-rendering / updating format etc to dynamically display as appropriate).. something like that. they can /delegate opus 5.5 /research-doc or whatver to see what open source popular packages or frameworks or ui/ux and/or / best practice / industry standard or best design patterns etc are for this and just do that and try not to handroll it so we don't have to maintain all this tuff. we should be leveraging stuff from communicity and popular well established adn roust frameworks and component libraries and whatever else so this all just works and looks nice and is best practice / industry standard and/or popular UI/UX liraries/frameworks / components / tools / design patterns etc for all this so we don't have to buid and maintain this and get it working on our own to have that modern UI/UX web app experience. so they can /orchestrate opus 5.5 /auto-flow for all that and in general this applies to all the work theyr'e doing for beads-ui web app. so if that's not currently the case for what they're working on and designing and how they're approaching it, then it should be and so they should update and pivot / refactor etc and do more resarch and so on so forth to do this. i don't want this to be some hand-rolled app that we have to build and maintain and fiddle with to get the basics right. we can hand-write or customize or extend for any specific stuff that needs it and we can't just re-use or adopt or fork etc from existing stuff that's popular and mature and well-maintained etc, but in general even then we should be working on top of libraries and frameworks and whatnot to build it within the design patterns and architectures and component systems etc so we can leverage all that stuff and just extend / customize it and/or fork it and maybe even share parts of it like components etc and/or contribute upstream PRs for any forked repos we use for any frameworks / libraries / tools etc that are popular and well-maintained and mature in the frontend web dev ecosystem etc. and/or we can at elast open source some  of what we've built either in beads-ui and/or as separate packages / framework / library / package / tooling / component libraries etc as appropriate.
```

The follow-up's library requirement is covered under [Authenticator enrollment and verification](#authenticator-enrollment-and-verification). Its account-action placement is covered under [Browser Sign-in](#browser-sign-in). The responsive-shell design owns layout and sidebar behavior.

**Status:** Draft

**Created:** 2026-11-20

<!-- doc:region name="overview" kind="replaceable" -->

## Table of Contents

- [Founding Ask Coverage](#founding-ask-coverage)
- [Table of Contents](#table-of-contents)
- [Executive Summary](#executive-summary)
- [Summary for a wide audience](#summary-for-a-wide-audience)
- [Problem Statement](#problem-statement)
- [Design Overview](#design-overview)
- [Browser Sign-in](#browser-sign-in)
  - [Tailnet identity](#tailnet-identity)
  - [Authenticator enrollment and verification](#authenticator-enrollment-and-verification)
  - [Code limits and recovery](#code-limits-and-recovery)
- [Data Model](#data-model)
- [Integration](#integration)
- [Implementation Phases](#implementation-phases)
  - [Slice A — Persistent sessions](#slice-a--persistent-sessions)
  - [Slice B — Tailnet identity sign-in](#slice-b--tailnet-identity-sign-in)
  - [Slice C — Authenticator sign-in and recovery](#slice-c--authenticator-sign-in-and-recovery)
  - [Slice D — Sign-in help and icons](#slice-d--sign-in-help-and-icons)
- [Implementation Audit](#implementation-audit)
- [Risks and Mitigations](#risks-and-mitigations)
- [Conflicts found](#conflicts-found)
- [Design Decisions](#design-decisions)
  - [Decision Summary](#decision-summary)
  - [Decision Details](#decision-details)
  - [D-1: Persistent sessions](#d-1)
  - [D-2: Tailnet identity sign-in](#d-2)
  - [D-3: Authenticator sign-in and recovery](#d-3)
  - [D-4: Sign-in help and icons](#d-4)
- [Open Questions](#open-questions)
- [Feedback Rounds](#feedback-rounds)
- [Approval Log](#approval-log)
- [Run History](#run-history)

## Executive Summary

Beads UI will remember sign-ins across browser refreshes and service restarts. A session can last 30 days, ends after seven days of inactivity, and can be revoked from the browser or the host. The app will sign in approved Tailscale users automatically once it can prove the request came through Tailscale Serve. On other connections, users will sign in with Authy or another compatible authenticator and can recover access with a saved code or a host-issued link. The sign-in page will show the app icon and name the command that helps users find the sign-in URL.

## Summary for a wide audience

Keep using your existing bookmark after a restart. If Beads UI asks you to sign in, enter the code from your authenticator app. Set it up once while signed in, and save the recovery codes somewhere safe. Use “Sign out everywhere” in the account menu to end your sessions on this server.

## Problem Statement

At `234714a`, ordinary refresh with a live cookie already works, but `AuthLayer` keeps sessions in memory, so restarting the web process invalidates them. The current lifetime is 12 hours absolute and two hours idle. Without a usable session, the page tells the user to run a host command to mint a new five-minute link. Parts 2 and 3 remove that routine link step and make sign-in help discoverable. Part 1 supplies the session store. [Auth implementation](../../apps/web/server/auth.ts) · [Web app design and architecture](beads-ui-web-app-design.md#architecture).

## Design Overview

This draft specifies the browser sign-in changes on top of the web app's authentication decision. A live cookie continues to authorize browser reads and writes. A new session comes from authenticated Serve identity, a verified authenticator code, a recovery code, or the existing host-issued recovery exchange. All four paths use the same session policy. The implementation audit records the deployed transport and verified behavior when each slice lands. [Web app authentication decision](beads-ui-web-app-design.md#d-17).

## Browser Sign-in

An unauthenticated document navigation can establish a session through trusted Serve identity. API, asset, stream and background requests never create sessions as a side effect. The unauthenticated browser page offers code entry after enrollment and gives host recovery guidance for first enrollment or loss of access. The current recovery exchange remains single-use, expires after five minutes and redirects to a clean URL. Place “Sign out everywhere” in the app shell's account menu. The action revokes all browser sessions on this server, clears the invoking browser's cookie and lands on a signed-out page that requires an explicit return to sign-in, even when Serve can identify the requester. [Responsive app-shell design, account menu (PR 115)](https://github.com/sergeiwallace/beads-ui/blob/a7d43429c4721af913bc7187a997875bccf6cd8a/docs/designs/beads-ui-responsive-app-shell-design.md#app-shell).

### Tailnet identity

Tailscale Serve removes inbound values for `Tailscale-User-Login`, `Tailscale-User-Name` and `Tailscale-User-Profile-Pic` before supplying the trusted fields for the requester. Tagged devices have no user identity headers. Users who accepted a device share can have identity headers, so Serve identity still needs the application's allowlist. Serve only sanitizes requests it proxies. A direct client can supply those headers itself, including from another process on the Serve host. `Tailscale-App-Capabilities` is separate from login and grants no sign-in authority here. [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve#identity-headers).

The TCP listeners bind loopback only. To accept `IDENTITY_HEADER` (`tailscale-user-login`), require both a loopback peer and verified Serve provenance at the connection boundary. A separate loopback inlet is acceptable only if the operating system or authenticated transport restricts who can connect to it and startup fails closed without that protection. A source address, a separate port by itself, a Host value, or forwarded headers provide no such proof. Reject an identity header on a direct request even when a valid cookie is present. On the proven Serve path, a login must be a single value and exactly match the user-owned `[auth] dispatch_identities` list. Refuse malformed or disallowed login values. Requests with no identity take the standard session or code sign-in path.

`apps/web/server/allowlist.ts` gates repository visibility with `[hosts] allow_repos`. `auth.ts` owns the identity list and currently reads the raw login for attribution and the extra dispatch check after cookie authentication. Use the same provenance-checked identity for sign-in, attribution and dispatch. Bind a Serve-issued session to that login and require the same trusted, still-allowlisted login when using it. This prevents a retained cookie from bypassing the Serve allowlist or hiding a changed identity. [Repository allowlist](../../apps/web/server/allowlist.ts) · [Auth layer](../../apps/web/server/auth.ts).

> **Feedback Round 1:** Does this approach feel right? What's missing?

<!-- When user writes feedback above, append the response and next feedback round. Preserve prior feedback verbatim. -->

### Authenticator enrollment and verification

The app has one configured browser owner. From a signed-in session, the owner can start enrollment with a same-origin protected write. Render the QR locally once per enrollment attempt, with a short-lived pending seed bound to that session. Reloading or revisiting the page never retrieves that QR or seed. Cancel or expire an unfinished attempt and generate a new seed on explicit retry. Confirm a code before activating the seed. Require the existing factor or a fresh host-authorized recovery session to replace an enrolled factor. An interrupted replacement leaves the prior factor usable. [OWASP Multifactor Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

Use `otpauth` on the server for RFC 6238 TOTP generation, validation and provisioning. Generate a fresh 160-bit seed with Node's cryptographic RNG and pass those bytes as an `OTPAuth.Secret` to `OTPAuth.TOTP`. Set `algorithm: "SHA1"`, `digits: 6` and `period: 30` explicitly to preserve Authy compatibility. Use `totp.generate({ timestamp })` when generating a code and `totp.toString()` to produce the provisioning URI. The URI carries a percent-encoded issuer and account label, a matching `issuer` parameter, an unpadded Base32 seed and the configured algorithm, digits and period. Scan the Beads UI QR in Authy and Google Authenticator with synthetic enrollment. [OTPAuth README](https://github.com/hectorm/otpauth/blob/bfac4efedee33ee87108e5ec96d43b15b168e7da/README.md) · [TOTP and URI source](https://github.com/hectorm/otpauth/blob/bfac4efedee33ee87108e5ec96d43b15b168e7da/src/totp.js) · [Node crypto](https://nodejs.org/api/crypto.html) · [Google Authenticator Key URI Format](https://github.com/google/google-authenticator/wiki/Key-Uri-Format) · [Twilio TOTP Quickstart](https://www.twilio.com/docs/verify/quickstarts/totp).

OTPAuth's `totp.validate({ token, timestamp, window })` returns the first matching step's signed offset, or `null`. With `window: 1` it checks `T`, `T−1`, then `T+1`, stopping on a match. It calls Node's `timingSafeEqual` for each equal-length comparison. The window search can stop early, so the comparison guarantee applies per code, and the library's single window search can leave other matching steps undiscovered. [TOTP source](https://github.com/hectorm/otpauth/blob/bfac4efedee33ee87108e5ec96d43b15b168e7da/src/totp.js) · [HOTP validation source](https://github.com/hectorm/otpauth/blob/bfac4efedee33ee87108e5ec96d43b15b168e7da/src/hotp.js) · [Timing-safe comparison source](https://github.com/hectorm/otpauth/blob/bfac4efedee33ee87108e5ec96d43b15b168e7da/src/internal/crypto/timing-safe-equal.js).

Keep the effective window at one adjacent step on either side. The previous step covers transmission delay and the next covers a fast phone clock. For sign-in and enrollment confirmation, capture the server timestamp once. Call `validate` with `window: 0` at that timestamp and at offsets of minus and plus one period, checking `delta !== null` for all three calls. Use `totp.counter({ timestamp })` at each matching timestamp to identify the steps to consume. OTPAuth's `afterCounter` is a high-water mark. The app tracks individual steps so that an unused earlier step can still be accepted within the window.

If no step matches or any matching step was consumed, refuse the code. Atomically record every matching step for the factor before issuing a session or activating a confirmed seed. Persist consumed steps through their acceptance windows across restarts. Concurrent requests share the same replay and attempt state. [RFC 6238 §§ 5.2, 6 and Appendix B](https://www.rfc-editor.org/rfc/rfc6238#appendix-B) · [OTPAuth README](https://github.com/hectorm/otpauth/blob/bfac4efedee33ee87108e5ec96d43b15b168e7da/README.md).

The npm registry reported OTPAuth 9.6.0 as latest on 2026-11-24, published 2026-11-02, with an MIT license and one runtime dependency, `@noble/hashes` 2.4.0 (MIT, no runtime dependencies). npm counted 4,509,704 downloads for 2026-11-16 through 2026-11-22. These readings agree with the research's rounded figures. The default package supports HMAC with SHA-1, SHA-224, SHA-256, SHA-384, SHA-512 and SHA3-224, SHA3-256, SHA3-384 and SHA3-512. Its shared upstream suite exercises TOTP generation, validation and counter limits with its own fixtures. The RFC 6238 Appendix B vectors are absent from that suite, so Slice C tests them through the app's verification path. [npm registry](https://registry.npmjs.org/otpauth) · [Noble registry entry](https://registry.npmjs.org/@noble%2fhashes/2.4.0) · [npm downloads, measured week](https://api.npmjs.org/downloads/point/2026-11-16:2026-11-22/otpauth) · [HMAC source](https://github.com/hectorm/otpauth/blob/bfac4efedee33ee87108e5ec96d43b15b168e7da/src/internal/crypto/hmac-digest.js) · [Upstream tests](https://github.com/hectorm/otpauth/blob/bfac4efedee33ee87108e5ec96d43b15b168e7da/test/test.mjs).

Use Base UI's `OTPField` for enrollment confirmation and signed-out authenticator code entry. It ships in the existing `@base-ui/react` 1.9.0 dependency and supplies a labeled numeric field with full-code paste and `one-time-code` autofill. shadcn's Input OTP wraps the separate `input-otp` package. Keep the TOTP value a string so a leading zero survives submission. The signed-out 401 page loads a dedicated same-origin sign-in UI bundle from the auth handler after the Host check. Keep the existing script CSP and Trusted Types, the authenticated app's asset checks and the host recovery hint. [Base UI OTP Field](https://base-ui.com/react/components/otp-field) · [Base UI package export](https://registry.npmjs.org/@base-ui%2freact/1.9.0) · [Web UI dependencies](../../packages/web-ui/package.json) · [shadcn Input OTP](https://ui.shadcn.com/docs/components/base/input-otp) · [Content Security Policy](../../apps/web/server/csp.ts).

Encode the provisioning URI locally with the `qr` package (`paulmillr/qr`), using only its server-side encoder. Upstream documents cross-tests against Python's QR generator and an April 2026 maintainer self-audit in the signed 0.6.0 release. The npm registry confirms 0.6.0 has no dependencies and supports Node 20.19 or later. Review and pin the exact published encoder and verify a round-trip decode before allowing it to handle seeds. The available audit evidence is from the maintainer. [QR upstream](https://github.com/paulmillr/qr) · [QR release and audit notes](https://github.com/paulmillr/qr/releases) · [npm registry metadata](https://registry.npmjs.org/qr/0.6.0).

### Code limits and recovery

Use a persistent attempt limit per configured owner across public TOTP and recovery-code submissions. Five failures within five minutes trigger a five-minute lockout. A locked submission receives a generic `429` and `Retry-After`, and does not extend the lockout. Success clears the failure history. Validate same-origin writes before charging attempts, and serialize concurrent verification against the same budget. Give enrollment confirmation its own bounded attempt budget so an unauthenticated caller cannot lock the enrollment UI. A valid session, trusted Serve sign-in and host-issued recovery remain available during a code lockout. The thresholds are design values informed by OWASP's account-based throttling guidance. [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling) · [OWASP Multifactor Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

Generate ten independent recovery codes with 128 random bits each at successful enrollment. Display them once on the authenticated, non-cacheable confirmation response and advise saving them offline. Persist only a one-way digest for each code. Consume a matching digest atomically before issuing a session, and invalidate the old set on successful re-enrollment. A used, replaced or invalid code cannot open a session. Host-issued recovery is available if no saved code remains. [OWASP Multifactor Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html) · [NIST SP 800-63B-4, saved recovery codes](https://pages.nist.gov/800-63-4/sp800-63b.html).

## Data Model

| Record | Stored data and lifetime |
| --- | --- |
| Browser session | Part 1's server-state table stores a hashed session ID, a separate public revocation ID, creation and last-activity times, and the credential type and trusted identity when applicable. Retain credential rotation behavior, prune expired entries and invalidate the record on revocation. File mode `0600`. |
| Authenticator | Active seed for the configured owner, plus time steps already used and available recovery-code digests. Keep the seed in the same server state directory, encrypted at rest or in a service-owned regular file with mode `0600` at minimum. Fail closed on an unreadable or insecure credential file. |
| Pending enrollment | A short-lived seed tied to the signed-in session and enrollment attempt. Discard on expiry, cancellation or successful confirmation. A restart may require starting enrollment again. |
| Code attempts | Per-owner failure times and lockout deadline survive restart. Apply attempt accounting, step consumption and recovery-code consumption as atomic updates with no duplicate acceptance. |

Server logs, traces and error pages must exclude seeds, provisioning URIs, QR bodies, authenticator and recovery codes, cookie values and recovery-link credentials. Keep account and public session identifiers for existing write audit records. Use the established state-directory ownership and permission checks and keep process health probes credential-free.

## Integration

- **Web service.** Extend the existing auth layer, configuration validation, CLI and service tests. The systemd unit and the container use a loopback health probe. The documented container uses host networking to reach the loopback server. Direct or forwarded local browser access remains available through the code and recovery paths. Respect the public base path for the cookie, redirects, form requests and icons. [Service installer](../../apps/web/server/service.ts) · [Mounted paths](../../apps/web/server/portal.ts) · [Web run procedure](../procedures/web-run.md).
- **Authentication and authorization.** Keep Host checks on every request, the existing write header and same-origin checks on browser mutations, and the receiver, MCP and host-admin credential contracts. Session transport retains `HttpOnly`, `SameSite=Strict` and mount scoping. Use `Secure` for HTTPS-served cookies and keep local HTTP confined to the loopback and existing forwarded flows. Expiry or revocation also closes event streams. Preserve the repo allowlist and dispatch authorization. [Auth layer](../../apps/web/server/auth.ts) · [Web app authentication decision](beads-ui-web-app-design.md#d-17).
- **Help and packaging.** The `beads-ui-login` wrapper is installed on PATH by ai-harness's install-harness workflow. Have the web CLI expose URL resolution as `sign-in-url`. The wrapper prints the full shell-quoted absolute CLI invocation and its credential-free browser URL, honoring the configured origin and base path. The URL contains no user information, query or fragment. It never mints or prints a recovery link, session value or TOTP secret. The 401 page names `beads-ui-login`. Package the user-invoked `beads-ui-login` skill in the existing plugin, with installation at user scope across projects. Verify the bare and qualified slash names, and account availability separately. [Web CLI](../../apps/web/server/cli.ts) · [Plugin manifest](../../plugins/beads-ui/.claude-plugin/plugin.json) · [Claude Code skills](https://code.claude.com/docs/en/skills).
- **Public static resources.** Allow `GET` and `HEAD` for exactly `/icon.svg`, `/icon-32.png` and `/icon-192.png` after mount normalization and the Host check. The 401 page uses mount-safe favicon URLs and can show the icon before any session exists. Use the existing static response and content types. [HTTP app](../../apps/web/server/app.ts) · [Current icon tests](../../apps/web/test/favicon.test.ts).

## Implementation Phases

Build **A → B → C → D**. A's persistent store is owned by the part 1 implementation. Use synthetic settings and an isolated state directory for tests. Implement each named behavior after a failing test exercises its normal entry point, using real requests and persistence where applicable. Retain a reviewable failing-test checkpoint before changing behavior. The slice B spoof regression is the first test in that slice.

### Slice A — Persistent sessions

**Deliverables.** Extend the part 1 session table and `apps/web/server/auth.ts`. Add browser `POST /api/auth/v1/logout-all` behind the existing write checks. Connect it to the [account menu](#browser-sign-in) when the shell lands. Add `beads-ui-web revoke-session --all` through the existing host admin credential flow. Cover the route, CLI, browser and streams.

- [ ] **A1 / session survives refresh and restart.** When a signed-in browser refreshes or reconnects after restarting with the same state directory, the app shall admit the original live cookie and store only the hashed session ID at mode `0600`.
- [ ] **A2 / idle and absolute boundaries.** If seven days elapse without activity, or 30 days elapse since creation despite activity, then the next request shall be refused and the cookie cleared. An open stream alone shall leave the idle deadline unchanged.
- [ ] **A3 / browser sign out everywhere.** When an authenticated same-origin request posts to the bulk revocation route, the server shall revoke all current browser sessions, end their streams and clear the invoking cookie. The signed-out landing page shall remain signed out until the user returns to sign-in.
- [ ] **A3a / sign out everywhere from the account menu.** When the shell is available and the owner invokes “Sign out everywhere” from its account menu, the browser shall call the protected bulk revocation route and display the signed-out landing page. Verify the action under both mount paths at desktop and compact widths.
- [ ] **A4 / cross-site bulk revocation refused.** If the browser lacks a live session, lacks the write header, or fails the Origin or Fetch Metadata check, then bulk revocation shall leave sessions intact.
- [ ] **A5 / host bulk revocation.** When the host admin command authenticates, it shall revoke the same set of sessions. If it lacks a valid admin credential, then the server shall refuse it.
- [ ] **A6 / single revoke, logout and rotation parity.** When the host revokes one session or the browser logs out, the target shall remain unusable after restart. When the host rotates the browser secret, all older browser cookies shall fail.
- [ ] **A7 / unavailable session store fails closed.** If the store cannot commit issuance or revocation, then the server shall report failure without claiming the change succeeded.

**Exit gate.** A1–A7 HTTP and CLI coverage passes in `npm exec -- vitest run apps/web/test/auth.test.ts apps/web/test/service.test.ts`. Browser coverage passes in `npm run test:e2e -w apps/web -- auth.spec.ts`. Run A3a with the account-menu integration.

### Slice B — Tailnet identity sign-in

**Deliverables.** Bind loopback in `apps/web/server/server.ts` and enforce the verified connection boundary in `auth.ts`. Preserve the direct path for local access and host commands. Update the service setup and the auth/server regression tests. [Conflicts found](#conflicts-found) governs activation.

- [ ] **B1 / direct identity header rejected (write first).** Before changing the listener, proxy setup or auth code, record a failing HTTP test that sends a synthetic allowlisted login directly to the loopback backend. The regression shall assert HTTP 403 and no session issuance, both without and with a live cookie. Preserve that test when implementing the fix.
- [ ] **B2 / non-loopback binds refused.** If server configuration requests a tailnet IP or a wildcard or other non-loopback address, then startup shall refuse before opening a listener, even with a valid auth table.
- [ ] **B2a / Unix socket inlet and fail-closed permissions (chief ruling 2026-11-20).** The Serve-facing inlet is a Unix domain socket in the state directory, owned by the service user, mode 0600, and the identity header is read only on it. If the socket's mode is wider than 0600 or its owner is not the service user at start, then the service shall disable automatic sign-in and log why, while the TCP listener keeps the link and TOTP paths. A forged identity header sent over the TCP listener shall be ignored. Start the slice by repeating the Tailscale `unix:` support probe on the host (fw-lnx reads 1.104.1) and recording the version here; a host without support does not enable automatic sign-in.
- [ ] **B3 / trusted allowlisted Serve navigation signs in.** When a top-level browser navigation reaches the protected Unix-socket inlet through actual Tailscale Serve with one allowlisted login, the server shall issue a browser session without a recovery link. The integration test shall verify the browser reaches Beads UI using that session.
- [ ] **B4 / Serve strips caller-supplied identity.** When a request goes through actual Serve with a client-supplied login, the server shall see only the Serve-derived identity, or no user identity from a tagged device. A client-supplied allowlisted login shall never change the outcome.
- [ ] **B5 / unknown or unusable provenance fails closed.** If provenance is missing, unverified or misconfigured, or the serving inlet becomes directly reachable, then automatic sign-in shall remain disabled. Test from a separate untrusted local process and with a real inbound Serve request as the positive control.
- [ ] **B6 / identity allowlist enforced.** If a proven Serve connection presents a disallowed, empty, duplicate or malformed login value, then browser sign-in shall be refused. If a Serve session's login changes or leaves the allowlist, then its cookie shall stop admitting requests.
- [ ] **B7 / no identity presents fallback.** When a browser without a live session arrives without identity, including over Serve from a tagged device, the server shall show the sign-in page with host recovery guidance. When C is available and the owner is enrolled, the same page shall offer authenticator code entry. Keep identities out of unauthenticated API responses and retain receiver, MCP and host-admin credential checks.
- [ ] **B8 / protected browser writes and dispatch parity.** If a request lacks its browser session, Host authorization or required write checks, then protected writes shall be refused. When dispatch sees a valid trusted login, it shall retain the identity allowlist check. Repositories remain subject to `[hosts] allow_repos`.

**Exit gate.** Review the B1 failing-test checkpoint, run `npm exec -- vitest run apps/web/test/auth.test.ts apps/web/test/server.test.ts apps/web/test/allowlist.test.ts apps/web/test/service.test.ts`, and capture passing B3–B5 evidence against Serve on an isolated test service. Do not activate automatic sign-in without that evidence.

### Slice C — Authenticator sign-in and recovery

**Deliverables.** Add enrollment, code verification and recovery UI/routes, protected factor and attempt state, server-side OTPAuth and QR encoding, and the Base UI OTP Field. Serve the signed-out field's dedicated bundle at `GET /api/auth/v1/sign-in-ui.js` under the active mount. Drive the real auth routes in `apps/web/test/totp.test.ts` with a controlled server clock and real OTPAuth calls. Cover browser flows in `apps/web/e2e/auth.spec.ts`. Change routine `--open` behavior to open the ordinary browser entry point. Keep `login-link` for deliberate host recovery.

- [ ] **C1 / authenticated one-time QR.** If the request lacks a signed-in session or fails the browser write checks, then enrollment shall reveal no QR or seed. When a signed-in owner starts enrollment, the QR shall appear once and decode to the expected issuer, account, seed and TOTP parameters. Scanning it with Authy and Google Authenticator shall produce the same six-digit code for the current step.
- [ ] **C2 / confirm before replacing.** If a pending enrollment expires, its original session ends, or a replacement request lacks fresh proof, then the pending seed shall never become active. When the owner pastes a valid code into the labeled enrollment field and confirmation commits, the app shall enable authenticator sign-in and display the new recovery codes once.
- [ ] **C3 / RFC 6238 vectors through the sign-in route.** When the HTTP sign-in route receives each of the 18 Appendix B codes with its published seed and timestamp, it shall issue a session. Set the eight-digit SHA-1, SHA-256 and SHA-512 profiles only in the test fixture via server construction. Exercise the same route with the six-digit production profile and an independently derived leading-zero vector.
- [ ] **C3a / adjacent-step window boundaries.** When the route receives a code for step S, it shall accept it from the start of S−1 through the final millisecond of S+1. If submitted one millisecond before or after those bounds, then it shall refuse it. Test the four boundary instants with fresh factor state and a code that does not recur in the tested steps.
- [ ] **C4 / code sign-in and replay.** When the owner enters a valid unused code without trusted identity, the browser shall receive a normal session. If a used step is retried within its window, including after enrollment confirmation, concurrently or after a restart, then the route shall issue no further session. When an earlier eligible step still has an unused, distinct code, the route shall accept it after a later step succeeds.
- [ ] **C4a / matching-step collision.** When two eligible steps produce the same code, a successful submission shall consume both. If either matching step is already consumed, then the route shall refuse the submission even when the other step is unused.
- [ ] **C5 / wrong-code lockout.** When the fifth well-formed wrong TOTP code arrives within five minutes, the server shall apply a five-minute lockout across public TOTP and recovery submissions, including requests from different client addresses or after a restart. If a valid code arrives during the lockout, then the server shall return a generic `429` with `Retry-After` and leave the deadline fixed. Existing sessions and host-issued recovery shall remain usable.
- [ ] **C6 / hashed single-use recovery.** When an unused recovery code succeeds, the app shall consume its digest and issue a session once, including under concurrent use. If a code was used or belongs to a replaced enrollment, then it shall be refused. Stored recovery records shall contain no raw codes.
- [ ] **C7 / state and response confidentiality.** If factor state is insecure or unavailable, then verification shall fail closed. Enrollment responses shall use no-store caching and send no secret to outside services. Logs and errors shall omit authentication secrets.
- [ ] **C8 / browser code entry and host recovery parity.** When an enrolled owner opens the regular app URL without a session or trusted identity, the 401 page shall accept a pasted six-digit code, preserve any leading zero and submit it to the same-origin verification route. When a host issues a recovery link, it shall remain single-use, expire in five minutes, reject a cross-site exchange and redirect to the clean base path. `--open` shall open the normal app URL without minting a link.
- [ ] **C9 / cross-site code submission refused.** If an authenticator or recovery request fails the existing browser write checks, then it shall issue no session and charge no attempt.
- [ ] **C10 / signed-out script access.** When the sign-in page loads its named bundle under either mount, the browser shall run it under the existing CSP. If a signed-out request names any authenticated app asset or an unsupported method on the bundle route, then it shall receive no bundle or asset. A request with a disallowed Host shall be refused.

**Exit gate.** Run `npm exec -- vitest run apps/web/test/totp.test.ts apps/web/test/auth.test.ts` and `npm run test:e2e -w apps/web -- auth.spec.ts`. Record successful scans from both phone apps with synthetic enrollment. Confirm a test catches removal of replay protection and of the attempt limit.

### Slice D — Sign-in help and icons

**Deliverables.** Add the credential-free help invocation in the Beads UI CLI, the 401 hint and public icon routes. Ship `plugins/beads-ui/skills/beads-ui-login/SKILL.md` and install the thin PATH wrapper through ai-harness in its owning repository. Use the same skill source for its project and account distribution. Add focused CLI, packaging and favicon tests.

- [ ] **D1 / PATH wrapper prints command and URL.** When install-harness installs the wrapper and the user invokes it from an unrelated repository, it shall print the full absolute command and the correct credential-free URL, including on a mounted deployment. If no valid destination can be resolved, then it shall give an actionable error and emit no credentials on either output stream.
- [ ] **D2 / skill discovers wrapper across projects.** When the plugin is installed at user scope, `/beads-ui-login` shall invoke the skill from two unrelated projects on the supported client. The qualified name shall resolve to the same skill. On invocation, the skill shall supply the safe command and URL, including a missing-wrapper hint when the installer has not run. Account-level verification shall check that the same skill is available independently of a specific checkout.
- [ ] **D3 / 401 names the command and displays the icon.** When a signed-out browser opens the app at either `/` or `/beads/`, its 401 document shall name `beads-ui-login` and resolve its favicon without a session. The hint shall remain available if the authenticator field cannot load.
- [ ] **D4 / exact paths for the public icon exception.** When a signed-out client sends `GET` or `HEAD` to any of the three icon paths, it shall receive the correct type, with an empty body for `HEAD`. If it requests a neighboring asset, protected route or an unsupported icon method, then the icon exception shall grant no access. A disallowed Host shall still be refused.

**Exit gate.** Run `npm exec -- vitest run apps/web/test/auth.test.ts apps/web/test/favicon.test.ts apps/web/test/service.test.ts`, `npm run test:e2e -w apps/web -- auth.spec.ts` and `node scripts/check-plugin-allowlist.mjs plugins/beads-ui plugins/beads-ui/validate-allowlist.json` for strict plugin validation. Run the installer and skill discovery checks in isolated fixtures, then verify independent account-level availability as described above.

> **Feedback Round 1:** Does the phasing feel right: too big, too small? Should anything move earlier or later?

<!-- When user writes feedback above, append the response and next feedback round. Preserve prior feedback verbatim. -->

## Implementation Audit

| Phase | Section or decision | Verified | Evidence to record |
| --- | --- | --- | --- |
| A | D-1, part 1 handoff and all-session revocation | - [ ] | Restart, clock boundaries, refusal, stream termination and account-menu tests. |
| B | D-2 and Serve trust boundary | - [ ] | Spoof test written first, actual Serve provenance, loopback bind and allowlist checks. |
| C | D-3 and factor state | - [ ] | HTTP RFC 6238 vectors, window edges, replay, recovery and wrong-code lockout tests. Browser field and phone scan tests. |
| D | D-4 and distribution | - [ ] | Wrapper, project and account skill availability, 401 and icon tests. |
| N/A | Design Overview | - [ ] | Record the deployed transport and delivered contracts as the phases land. |

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Host compromise or stolen browser cookie | Access can outlive a refresh or restart. | Store only hashed session IDs, enforce both server-side deadlines and offer revocation from browser and host. |
| Local process impersonates Serve | A forged identity could open the app. | Require verified transport provenance, deny direct identity headers and use B1–B6 as the activation gate. |
| Phishing or guessing an authenticator code | TOTP on this fallback is a single possession factor and can be phished or guessed. | Keep the narrow step window, consume each success once and persist the account attempt limit. |
| Lost authenticator or targeted lockout | The owner cannot enter a current code. | Provide offline single-use recovery codes and preserve deliberate host recovery. |
| Enrollment leak or interruption | A leaked seed can produce codes or an incomplete replacement can lock out the owner. | Show the QR once, confirm before activating, keep the prior factor until replacement commits and require fresh proof to replace it. |

## Conflicts found

- **B — The current listener cannot prove Serve provenance.** Serve strips injected headers on requests it proxies, and the current service uses a single ordinary loopback listener. Direct local clients can connect to it and present the same identity headers. `service.ts` installs the web unit and probes health, with no mechanism that proves the Serve peer. Enabling B on this deployment as written today would violate the settled provenance and spoof-rejection conditions. Keep the decision and block activation until B1 and the real-Serve checks demonstrate an enforced boundary. The existing server also allows non-loopback binds with a valid auth table, which B explicitly removes. [Current listener](../../apps/web/server/server.ts) · [Service installer](../../apps/web/server/service.ts) · [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve#identity-headers).
- **D — A user-scope plugin covers projects in the installed Claude Code client.** If “account wide” includes cloud or Cowork sessions, plugin installation alone cannot deliver that reach. Claude Code documents a separate account skill distribution path. Keep the packaging and account-wide requirement and verify account distribution independently before declaring D complete. [Claude Code skills](https://code.claude.com/docs/en/skills).

<!-- /doc:region name="overview" -->

<!-- doc:region name="decisions" kind="replaceable" -->

## Design Decisions

### Decision Summary

The worker brief supplies the chief's Opus ruling dated 2026-11-20 and Sergei's verbatim excerpts. It supplies no original recommendation table or concrete model ID, effort or profile for the chief. The records below preserve that provenance gap.

| # | Decision | Options considered | Recommended (AI) | Chosen | Diverged? | Rationale | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D-1 | Persistent sessions | Durable server sessions, in-memory sessions, or self-contained cookies | Unverified | (a), chief ruling | Unverified | Survive restarts and retain revocation. | Settled |
| D-2 | Tailnet identity | Proven Serve identity or cookie-only admission | Unverified | (a), chief ruling | Unverified | Remove the routine link step on verified, allowlisted connections. | Settled |
| D-3 | Authenticator sign-in | Server-side TOTP using OTPAuth or host links for routine fallback | Unverified | (a), chief ruling | Unverified | Support Authy and routine sign-in from the browser. | Settled |
| D-4 | Sign-in help and icons | Installed help and public icons or manual documentation and protected assets | Unverified | (a), chief ruling | Unverified | Help users find the app from the sign-in page or any project. | Settled |

### Decision Details

<a id="d-1"></a>

#### D-1: Persistent sessions — `✅ Resolved by chief (Opus)`

**Context.** Refresh should continue using the current session, and a service restart should stop forcing a new sign-in. The parallel part 1 implementation owns the store.

##### (a) Durable, revocable server sessions

**Pros:**

- A restart can keep the original session and its deadlines.
- The browser and host can explicitly revoke all sessions.

**Cons:**

- The longer window gives a stolen cookie more time to be used.
- Persistence adds a state dependency and a concurrent update boundary.

##### (b) Keep sessions in memory and shorten the re-entry flow

**Pros:**

- Keeps session state simple and clears it on every process restart.

**Cons:**

- Discards valid sessions during ordinary service maintenance.

##### (c) Use a signed cookie with no server-side session record

**Pros:**

- Keeps sessions across restarts without table I/O.

**Cons:**

- Per-session revocation and reliably enforced idle expiry would need server state anyway.

##### Recommendation

> **Decision:** `✅ Resolved by chief (Opus)` — (a) Durable, revocable server sessions.
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=UNVERIFIED; ai-effort=UNVERIFIED; ai-profile=UNVERIFIED -->
<!-- decision-lineage: decision-id=BU-ute/D-1; decision-topic=browser session lifetime and revocation; governs=apps:web,security:browser-sessions; normalized-proposition=browser sessions persist in protected state for up to 30 days absolute or seven idle days and support bulk revocation; applicability=slice:A; outcome-id=persistent-sessions; relation=different-question; related-decision-id=BU-mg2.5.3/D-17; supersedes=; approval-log-decision-id=; approval-actor=; approval-date=; approval-commit= -->

Use the part 1 table with hashed session IDs and mode `0600`. A 30-day absolute deadline, a seven-day idle deadline and explicit bulk revocation bound the exposure of long-lived cookies. Make issuance and revocation fail closed if the persisted change cannot commit, and cover races and process restarts at the HTTP entry point.

---

<a id="d-2"></a>

#### D-2: Tailnet identity sign-in — `✅ Resolved by chief (Opus)`

**Context.** The personal-pair deployment already uses Serve. Direct loopback and forwarded access share the browser auth layer and must remain protected.

##### (a) Sign in from verified Serve ingress and an allowlisted login

**Pros:**

- An approved tailnet user can open the app without a one-time link.
- The same deployment can still serve direct connections with a separate sign-in path.

**Cons:**

- A loopback source address alone cannot prove Serve ingress.
- A deployment that cannot enforce the ingress boundary cannot offer automatic sign-in.

##### (b) Keep cookie-only admission with host-issued sign-in

**Pros:**

- Uses the existing browser credential on either machine pair.
- Avoids an additional transport trust dependency.

**Cons:**

- An allowlisted tailnet user still needs a separate sign-in step.

##### Recommendation

> **Decision:** `✅ Resolved by chief (Opus)` — (a) Sign in from verified Serve ingress and an allowlisted login.
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=UNVERIFIED; ai-effort=UNVERIFIED; ai-profile=UNVERIFIED -->
<!-- decision-lineage: decision-id=BU-ute/D-2; decision-topic=trusted tailnet identity as a browser sign-in credential; governs=apps:web,security:serve-ingress; normalized-proposition=the web server accepts allowlisted Serve identity on a proven loopback connection and rejects client-supplied identity on direct requests; applicability=slice:B; outcome-id=proven-serve-ingress; relation=different-question; related-decision-id=BU-mg2.5.3/D-17; supersedes=; approval-log-decision-id=; approval-actor=; approval-date=; approval-commit= -->

Loopback-only binding, proof of Serve provenance and the existing identity allowlist are all required. Write the direct spoof rejection test first and keep automatic sign-in disabled until the ingress checks pass against actual Serve. Keep the host-issued link for recovery.

**Provenance mechanism (chief ruling, 2026-11-20, supersedes the chief's earlier (b) wording on how Serve provenance is proved).** The first (b) wording trusted the identity header "on a loopback connection that came through Serve", but a TCP loopback listener cannot prove that: any local process can connect to 127.0.0.1 and send a forged header. The chief therefore ruled:

- The web server listens on a Unix domain socket in the state directory, owned by the service user, mode 0600. Tailscale Serve proxies to that socket with a `unix:` target. The identity header is honored only on requests that arrive on that socket.
- The TCP loopback listener never honors the identity header, even when it is present. A test sends a forged header over TCP and requires it to be ignored (this is the first test written in slice B, before any code that reads the header).
- The service fails closed at start if the socket's permissions are wider than 0600 or its owner is not the service user: it refuses to enable automatic sign-in and logs why. The host-issued link and the TOTP path keep working on the TCP listener.
- Probe before building: the installed Tailscale on fw-lnx is version 1.104.1 (commit 7f4efe814ff1, read with `tailscale version` on 2026-11-20), and its `tailscale serve --help` lists Unix-socket targets ("you can also specify a Unix domain socket (e.g., unix:/tmp/myservice.sock)", "Expose a service listening on a Unix socket (Linux/macOS/BSD only)"). The same probe must pass on every host that enables automatic sign-in; a host whose Tailscale lacks `unix:` support does not enable it and does not fall back to TCP trust. Slice B starts by repeating this probe and recording each host's version in this doc.
- The socket admits the service user's own processes, which can already read the session store and mint a login link, so no new local trust is created. Other local users cannot connect. `tailscaled` runs as root and connects regardless of the mode.

---

<a id="d-3"></a>

#### D-3: Authenticator sign-in and recovery — `✅ Resolved by chief (Opus)`

**Context.** Users outside the trusted Serve identity path need a browser sign-in flow that works with mobile Authy.

##### (a) RFC 6238 TOTP for everyday fallback, with saved codes and host recovery

**Pros:**

- Works from the ordinary app URL with a compatible authenticator.
- Removes the need for a host command on every fallback sign-in.

**Cons:**

- The server must protect a shared seed and handle clock drift, replay and guessing.
- Losing the phone can interrupt access.

##### (b) Use host-issued links for routine fallback

**Pros:**

- Reuses an existing flow with high-entropy, single-use credentials.
- Needs no phone enrollment or clock coordination.

**Cons:**

- Still requires host access and a new link on each sign-in.

##### Recommendation

> **Decision:** `✅ Resolved by chief (Opus)` — (a) RFC 6238 TOTP for everyday fallback, with saved codes and host recovery.
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=UNVERIFIED; ai-effort=UNVERIFIED; ai-profile=UNVERIFIED -->
<!-- decision-lineage: decision-id=BU-ute/D-3; decision-topic=everyday browser sign-in without trusted tailnet identity; governs=apps:web,security:authenticator; normalized-proposition=browser sign-in without trusted identity uses RFC 6238 with signed-in QR enrollment and hashed recovery codes; applicability=slice:C; outcome-id=totp-fallback; relation=different-question; related-decision-id=BU-mg2.5.3/D-17; supersedes=; approval-log-decision-id=; approval-actor=; approval-date=; approval-commit= -->

Use [OTPAuth and Base UI's OTP Field](#authenticator-enrollment-and-verification) with the Authy-compatible profile. Require a signed-in session for one-time QR display and confirm enrollment before activation. Store the seed encrypted or under owner-only mode `0600`, keep secrets out of logs, and enforce the bounded clock window, persistent replay protection and account lockout. Hashed single-use recovery codes and the existing one-time link cover loss of the phone and initial enrollment.

---

<a id="d-4"></a>

#### D-4: Sign-in help and icons — `✅ Resolved by chief (Opus)`

**Context.** Help must be discoverable from the browser and any project, including when the browser has no session.

##### (a) Install the PATH helper and plugin skill, and serve the three public icons

**Pros:**

- Keeps host-specific URL and command resolution in one place.
- Lets the user find help and recognize the sign-in tab before signing in.

**Cons:**

- The CLI and skill involve two repositories and distribution surfaces.
- A careless static exception could expose assets beyond the three icons.

##### (b) Point users to manual sign-in documentation and keep all icons behind auth

**Pros:**

- Avoids installer and plugin work.
- Keeps the existing static auth rule.

**Cons:**

- The user must find the host invocation and mounted URL by hand.
- The signed-out browser tab cannot display the app's icon.

##### Recommendation

> **Decision:** `✅ Resolved by chief (Opus)` — (a) Install the PATH helper and plugin skill, and serve the three public icons.
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=UNVERIFIED; ai-effort=UNVERIFIED; ai-profile=UNVERIFIED -->
<!-- decision-lineage: decision-id=BU-ute/D-4; decision-topic=discoverability of the sign-in entry point; governs=apps:web,plugin:beads-ui,installer:ai-harness; normalized-proposition=401 names a credential-free PATH helper, the plugin ships the cross-project skill, and three named icons are public; applicability=slice:D; outcome-id=installed-sign-in-help; relation=different-question; related-decision-id=; supersedes=; approval-log-decision-id=; approval-actor=; approval-date=; approval-commit= -->

Have install-harness install the thin `beads-ui-login` wrapper and ship the `/beads-ui-login` skill in the Beads UI plugin. Share URL resolution with the web CLI, test project and account reach, and keep all credentials out of helper output. The 401 names the helper and uses an exact allowlist for the three icons after the Host check.

---

> **Feedback Round 1:** Your approval/feedback on each decision:

<!-- When user writes feedback above, append the response and next feedback round. Preserve prior feedback verbatim. -->

## Open Questions

None for the settled decisions. Implementation must resolve the deployment and distribution constraints recorded under [Conflicts found](#conflicts-found).

> **Feedback Round 1:** Your thoughts on the open questions:

<!-- When user writes feedback above, append the response and next feedback round. Preserve prior feedback verbatim. -->

<!-- /doc:region name="decisions" -->

<!-- doc:region name="feedback_rounds" kind="append_only" -->

## Feedback Rounds

No feedback rounds recorded.

<!-- /doc:region name="feedback_rounds" -->

<!-- doc:region name="approval_log" kind="append_only" -->

## Approval Log

| Date | Decision | Actor | Notes |
| --- | --- | --- | --- |
| 2026-11-20 | BU-ute/D-1 through BU-ute/D-4 | Chief (Opus) | Settled in the supplied ruling, with the interaction and distribution requirements from Sergei's ask. |

<!-- /doc:region name="approval_log" -->

<!-- doc:region name="run_history" kind="append_only" -->

## Run History

- 2026-11-24. Folded library-backed TOTP from research Gap 4 and the library evidence in § 4. Chose OTP Field because the existing Base UI package provides it. Linked bulk revocation to the account menu from § 2. [Gap 4](../research/beads-ui-ui-libraries-and-responsive-shell.md#gaps-blindspots-and-emergent-findings) · [§ 4](../research/beads-ui-ui-libraries-and-responsive-shell.md#4-whole-app-library-strategy) · [§ 2](../research/beads-ui-ui-libraries-and-responsive-shell.md#2-a-one-row-top-bar-at-every-zoom-and-width).

<!-- /doc:region name="run_history" -->
