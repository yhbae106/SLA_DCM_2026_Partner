# Dashboard quality review — 2026-10-22

- Back off revision requests after failure, pause automatic offline work and check revisions when returning to the tab. Manual refresh and pending edits are retained.
- Consume the login-link code and remove it from the current URL using replaceState before invoking login. This does not erase past server logs or previously copied links.
- Keyboard-accessible table scroll regions, focus, reduced motion and mobile input sizes improved.
- Validation: `node tests/harness.mjs`, polling and one-time-link tests. Production login page inspected; authenticated operations tested with fixtures rather than a real user's credentials.

## Verification and limits

- Repository regression harness passes, including existing save, scope, totals and draft-protection scenarios.
- Added behavioral checks for polling coalescing, hidden/offline suppression, backoff and revision changes.
- Browser preview checked for the public pages; authenticated production writes were not exercised.
- Existing local drafts, pending edits, remembered-code opt-in and verified data fallback are retained.
- No backend Apps Script changes or data migrations.
