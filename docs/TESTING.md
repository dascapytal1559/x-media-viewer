# Testing and release checks

`npm run check` verifies formatting, builds the scripts, and runs the automated suite. The suite uses jsdom with synthetic X markup and controlled media events. It covers startup, response-copy handling, flattened navigation, load-ahead discovery, delayed decoding, video buffering, stale completion, cache cleanup, close-to-post behavior, shortcuts, and zen mode.

The automated suite cannot validate browser painting, real decoding performance, Chrome’s native video controls, autoplay policy, or current X markup. The latest cleanup build has not yet been verified live in Chrome.

## Manual browser check

Use a normal X session and a timeline containing images, video, and multiple attachments. Reload the extension and refresh the X tab first.

1. Open with the extension icon and with X. Confirm it starts near the visible post and does not navigate to a different page.
2. Try arrows, W/S, A/D, and K/J across attachments and posts. Verify they do nothing while typing into X’s search or post fields.
3. Allow media to preload, then move forward and back. Check that the compact counter tracks the displayed item. Check first-time transitions for black flashes. Move quickly while preparation is incomplete: the current media should stay visible until the selected item is ready.
4. Check M and E for sound and Space for playback. Confirm video playback starts and the poster disappears after a frame becomes available.
5. Toggle Z on an image and a video. Confirm only media remains, keyboard navigation works, and Z restores the interface. Test F separately.
6. Close using X, Esc, the close button, and the extension icon. Check that the timeline returns to the displayed post, including after loading well ahead.
7. Reach a stalled timeline and retry. Check that errors can be skipped or retried and the viewer remains closable.
8. Inspect extension errors for new failures. Record the extension and Chrome versions and the checks actually performed.

## Repository and release

- Run `npm ci`, `npm run check`, and `npm run package` from a fresh checkout.
- Inspect the tracked files and release ZIP. Generated output, local backups, dependencies, credentials, and personal timeline captures should not be tracked.
- Confirm that repository visibility matches the release plan; this repository is now public. Confirm the MIT license is included in the repository and release ZIP. The package remains protected from accidental npm publishing by `private: true`.
- Record live browser results and known limitations before tagging a release. A passing CI run alone is not live X verification.
