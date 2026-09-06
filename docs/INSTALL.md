# Install and use X Media Viewer

For a release ZIP, extract it and keep the `x-media-viewer` folder somewhere permanent. For a source checkout, run `npm ci` and `npm run build`, then use `outputs/x-media-viewer`.

1. Open `chrome://extensions` in Chrome 111 or newer.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Pin **X Media Viewer** in Chrome’s extensions menu.
5. Open an X timeline. Press **X** or click the extension icon.

The viewer opens in the current tab near the post you are viewing. Closing returns to the post containing the displayed media. No additional login is required beyond your normal X session.

| Key                               | Action                                  |
| --------------------------------- | --------------------------------------- |
| X or extension icon               | Open / close                            |
| ↑ / ↓, ← / →, W / S, A / D, K / J | Previous / next media                   |
| Mouse wheel or vertical swipe     | Previous / next media                   |
| M or E                            | Mute / unmute                           |
| Space                             | Play / pause video                      |
| Z or Zen button                   | Show only media / restore the interface |
| F                                 | Enter / exit browser fullscreen         |
| R                                 | Retry failed media                      |
| Esc                               | Close; Chrome may first exit fullscreen |

Text entry and modified keyboard shortcuts are left alone. Every attachment is a separate step. Videos loop and initially play muted. In zen mode, keyboard shortcuts remain available, including Z to restore controls.

The header shows a compact position such as **1/12**: the displayed item out of the media discovered so far. If the next item is still preparing, the current visual stays visible. Video readiness means an opening playback buffer, not the entire video downloaded.

## Update

Replace the extracted release files, or rebuild your checkout. Click the circular **Reload** arrow on the extension’s card in `chrome://extensions`, then refresh existing X tabs. Refreshing an X tab alone does not reload an updated extension.

## Troubleshooting

- An **X** badge on the extension icon means the viewer could not open. Open an X page or refresh an older X tab after updating.
- If X asks you to sign in, close the viewer and sign in on X normally.
- If a video waits for its source, refresh the X tab so the extension can observe the source as the timeline loads.
- If a download fails, press **R** or skip the item. Leave zen mode with **Z** to see status messages.
- If discovery stops, press next at the end to retry, or close the viewer to inspect X.
- **Open post** opens the post associated with the media currently displayed.

External embeds and live streams without an MP4 source are unsupported. X page changes can require an extension update. To uninstall, choose **Remove** on its extension card.
