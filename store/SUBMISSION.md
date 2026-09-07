# Chrome Web Store submission

## Files

Run `npm ci` and `npm run package`.

- Upload: `outputs/x-media-viewer-store.zip` (manifest at ZIP root).
- Store icon: `outputs/store/icon-128.png`.
- Small promotional tile: `outputs/store/promo-440x280.png`.
- Screenshots: still pending. Capture at least one 1280×800 PNG of the actual viewer. `node scripts/preview.mjs` serves the actual viewer markup/styles with original demo artwork for an optional UI illustration; it is not a live extension test. Browser screenshot capture was blocked by an unavailable admin-policy check during this preparation pass.

## Listing

Name: X Media Viewer

Short description: Browse X photos and videos fullscreen with up/down navigation, decoded images and buffered videos prepared ahead.

Suggested category: Workflow & Planning, if available in the dashboard. Language: English. Price: Free. Distribution: Public.

### Detailed description

Browse the X timeline you are already viewing as a focused image and video feed.

Press X or click the extension icon to open the viewer in the current tab. Move through photos and videos using arrow keys, WASD, K/J, your mouse wheel, or a vertical swipe. Every attachment is a separate step, including multiple attachments from the same post.

The viewer prepares ten media items ahead. It downloads and decodes images and buffers the beginning of videos. If you move faster than loading completes, the current media stays visible while your selection prepares. The counter shows your position among discovered media; it does not claim every item is downloaded.

Use Z for a content-only zen mode, F for browser fullscreen, M or E to toggle sound, and Space to play or pause video. Close with X or Esc to return to the displayed post in the timeline. Shortcuts leave text entry alone.

Privacy: Runs only on x.com and www.x.com. Reads rendered posts and observes copies of X’s existing video responses to find media URLs, including before the viewer is opened. Post details and media URL caches stay in tab memory. Images and videos load directly from X’s media servers. No analytics, advertising, or developer-operated backend. No access to request cookies or authentication headers. Loading ahead scrolls X underneath and may cause X to load more posts.

Requires access to a working X timeline; X may require you to sign in. External video embeds and live streams without an MP4 source are not supported. X page changes can affect compatibility.

Independent open-source project, licensed under MIT. Not affiliated with or endorsed by X Corp.

### URLs

Homepage: https://github.com/dascapytal1559/x-media-viewer

Support: https://github.com/dascapytal1559/x-media-viewer/issues

Privacy: https://github.com/dascapytal1559/x-media-viewer/blob/main/PRIVACY.md

## Privacy fields

### Single purpose

Display photos and videos from the user’s current X timeline in a focused, keyboard-navigable viewer, with media preparation ahead and a return to the displayed post when closed.

### Host access justification

Content-script access is limited to https://x.com/* and https://www.x.com/*. It reads rendered timeline media and captions, overlays the viewer, handles keyboard navigation, and scrolls the page to prepare additional media. A main-world script observes copies of existing X responses to find MP4 sources; an isolated content script runs the interface. Observation begins when an X page loads so opening the viewer later can play already-loaded videos. It does not read request cookies, authentication headers, or tokens, or request separate X APIs.

### Remote code

No. All executable extension code is bundled in the ZIP. The extension receives JSON data and media resources from X but does not execute code from those responses.

### Data categories

Disclose local processing; do not claim that local-only operation means no data handling. Based on the current implementation, select Website content, Web history (the X post/media URLs used by the viewer), and Personally identifiable information (post authors’ usernames). This is transient processing of timeline content, not account-profile collection or tracking across sites. No deliberate collection of form inputs, passwords, authentication cookies, health data, payment information, or private messages. Review the exact wording presented by the dashboard before saving.

The three Limited Use certifications are consistent with this implementation: no data sale or transfers outside approved uses; no use or transfer for unrelated purposes; no use or transfer for creditworthiness or lending. The privacy policy explicitly states compliance.

## Reviewer test instructions

1. Install in Chrome 111 or newer. Open https://x.com/home or a profile timeline with photos and videos. Sign in to X if X requires it. The extension has no separate account system. Use a reviewer-controlled X account; no publisher credentials are included.
2. Press X or click the extension icon. The viewer should open in the same tab.
3. Use arrows or WASD to traverse media. Multiple attachments from one post appear consecutively. Allow time for media to prepare, then navigate forward and backward.
4. On video, test M/E for mute and Space for playback. Not every embed or live stream is supported.
5. Press Z, then Z again, to hide and restore the interface. Test F for browser fullscreen.
6. Close with X or Esc. The underlying timeline should return near the displayed post.
7. Typing X, WASD, M, or E into a search/post text field should not activate viewer shortcuts.

If the viewer cannot open after installation, refresh the X tab once. If X has reached an unavailable or sign-in page, restore a working timeline before testing.

## Current status

The store package and artwork have been prepared. Browser access to both the developer dashboard and local preview was blocked because the computer-use tool could not verify its admin-enforced security policy. No store item has been uploaded or submitted, and publisher registration status is unknown. Screenshots and live browser checks remain pending.

## Remaining dashboard steps

Register/sign in to the publisher account, upload the store ZIP, enter listing and privacy fields, upload images, and review any required account verification. Account registration can require accepting Google’s developer terms and paying a fee. Do not enter invented publisher identity or contact details.

Do not submit until the uploaded listing and privacy selections match these materials and a live Chrome test has been completed. Automated tests use synthetic media events, not current X responses.

## References

- https://developer.chrome.com/docs/webstore/prepare
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/webstore/publish
