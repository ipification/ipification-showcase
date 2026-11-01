# Next.js legacy UI parity

The Next.js showcase follows the existing [staging login UI](https://showcase.stage.ipification.com/auth/login). The reference was checked in Chrome on 29 October 2026 and compared with `public/css/style.styl` and the legacy views.

## Presentation

- White page with a centered 580px desktop column, the horizontal black IPification logo, Inter typography, underline tabs, and full-width method rows.
- Phone verification uses the inline country/dial-code selector. Stage still supports Wonderland (+999), including switching to and from real countries when configuration permits it.
- Identity places Anonymous Identity before the phone input, matching the legacy content order.
- QR, About, SMS, callback completion, and result screens use the legacy presentation. Callback errors retain the actionable explanation and safe diagnostics introduced during migration.
- Responsive layouts retain keyboard-accessible tabs, labeled controls, dialog focus handling, and reduced-motion support. No Bootstrap or jQuery was introduced.

The presentation is scoped in `src/features/login/legacy-showcase.css`; React/Radix components and the existing server services remain in use. Available methods, labels, logo overrides, country defaults, and the Site selector still come from configuration, so environments with different configuration can display different content.

The fallback logo is a local copy of the reference's [official horizontal logo](https://www.ipification.com/resources/logo/horizontalB.svg). Inter font files are served locally; their license is included in `public/fonts/INTER-LICENSE.txt`.

## Verification

Production build, ESLint, and TypeScript checks passed. All 18 Chromium scenarios passed against a fake provider and disposable Redis, covering desktop/mobile layout, tabs, country changes, QR callbacks across browser sessions, cancellation, OTP, TS43, and safe callback errors. These checks do not represent a production deployment or a new end-to-end verification against the real identity provider.

The existing local Chrome page at `http://localhost:3002/auth/login#pnv` was also visually checked at desktop width. This UI update does not change files under `src/server` or `runtime`.

## Usability additions

The approved follow-up retains the legacy layout and underline tabs while adding:

- Phone guidance connected to the input through `aria-describedby`, invalid feedback after leaving the field, and recovery after correcting the number.
- PNV, Login, and Identity omit the additional "About verification methods" section to follow the original screens.
- Pending indicators and an immediate activation guard. Cancelling SIM verification unlocks a new attempt; completion of an older attempt cannot unlock the newer one.
- HTTP status polling every two seconds for QR and IM, with no Socket.IO connection. Visible QR connection/waiting states and a button to create a new QR after connection failure or its server-issued deadline. QR has two minutes to start, then a separate five-minute completion window after a valid scan; provider expiry may differ. Refresh generates a fresh state, remounts the dialog, and cancels the previous status requests. Same-origin and exact-state validation still apply to completion URLs.
- Result presentation now follows the legacy title, full userinfo JSON and client id/state layout. JSON is visible immediately and preserves true/false values, their types, and all additional claims. When `phone_number_verified` is present, a short note explains phone verification outcomes and the string `"false"` truthiness pitfall. If the field is absent, no explanation is rendered. Copy JSON and its actionable clipboard-denial message remain available. No endpoint, provider response or session acceptance policy is changed.

Five additional Chromium scenarios cover invalid-input recovery, QR waiting timeout and stale callbacks, connection recovery, result disclosure/copy, and SIM cancellation/retry isolation. All 23 browser scenarios passed using the fake provider and disposable Redis.

Tab focus presentation tracks keyboard navigation separately from page/control focus. Pointer selection stays free of surrounding outlines across blur/focus restoration; Tab and arrow-key navigation retain a visible keyboard indicator. Browser shortcuts with Ctrl, Alt, or Meta do not switch the page into keyboard-navigation mode. The original bottom underline remains visible.

## Result visibility follow-up

The full original userinfo is visible by default for boolean/string true and false. Selected-field highlights and the technical-details disclosure were removed to restore the legacy reading order. Nested claims, false, zero, null and string/boolean types are preserved in both JSON and clipboard output. A compact note explains successful/unsuccessful/missing verification and safe backend comparison. Authentication/session policy and the separate phone QR success/error screens are unchanged.

Build, lint/typecheck and all 37 Chromium scenarios pass. Four new true/false/type scenarios failed with hidden JSON before the fix, then passed. Desktop and 375px mobile screenshots were inspected; no horizontal overflow was found. Working source/test/e2e file sets and hashes match the isolated verification copy. The active mobile development server on port 3002 remains ready.

## Phone entry compatibility follow-up

The upgraded phone library defaults to strict input-length rejection, unlike the legacy entry behavior. International input now explicitly disables strict length rejection and formatting while typing; the legacy digits-only sanitization remains. Nonempty input enables method buttons, and the existing validity check runs when a method is activated, before prepare/SMS/SIM calls. Clearing input disables methods, including Wonderland, and normalization still uses the library for real-country numbers. No provider/session policy changes were made.

Two browser regressions first reproduced early method disabling and digit truncation, then passed. Build, lint and typecheck pass; the complete 39-scenario Chromium suite passed, followed by 4/4 phone scenarios including the user's exact Serbia (+381) eighth-to-ninth digit case (40 distinct scenarios verified). Live dev verification also typed 123456789 sequentially with +381 after a full reload. The local dev server remains available for mobile testing; no real-provider authentication was performed.

Result-help visibility: the explanation is rendered only when the original userinfo has its own `phone_number_verified` field; the check does not use truthiness, so false remains included. Missing-claim regression failed before the change, then all five result browser scenarios (missing, boolean true/false, string true/false) passed. Build, lint/typecheck and diff checks passed. Raw userinfo, auth and session behavior are unchanged.

## QR dialog layout follow-up (2026-10-31)

The QR dialog uses a centered 420px maximum-width layout with 16px viewport clearance and a viewport-bounded scroll area. Header, QR quiet area and status/countdown remain in separate flow rows. Short landscape screens use two columns so the full QR and its instructions fit together; unusually small viewports can scroll. Recovery states keep the same layout. Mobile uses 24px padding; the close target is 44px. Content, colors, QR deadlines, polling and direct mobile authentication are unchanged.

A hydration warning observed in the user's Chrome showed an extra `cz-shortcut-listen="true"` body attribute. The app does not render that attribute; the same URL in a clean Chrome context had no console errors. Extension-induced markup differences are not suppressed in app code.

## Initial tab selection

On the initial server render, a loading screen is shown until browser preferences are read, then the header and tab content appear together. The URL hash takes precedence over the saved tab; unavailable or blocked storage falls back to the first configured tab. This avoids flashing the PNV tab before the saved selection appears.
