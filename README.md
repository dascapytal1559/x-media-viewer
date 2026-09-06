# X Media Viewer

Turn the X timeline you are already browsing into a fullscreen image and video viewer. Move through every attachment with the keyboard, including multiple images or videos from the same post.

- Open or close with **X** or the extension icon.
- Browse with arrows, **W/S**, **A/D**, or **K/J**.
- Prepare ten media items ahead: downloaded and decoded images, and buffered videos.
- Keep the current media visible while the next item prepares.
- Press **Z** for a content-only zen mode and **F** for browser fullscreen.
- Close the viewer to return to the displayed media’s post in the timeline.

This is an independent Chrome extension, unaffiliated with X. It uses the timeline available in your existing X session. It does not download an entire account archive.

## Install from source

Requires Node.js 22 or newer and npm to build, and Chrome 111 or newer to run.

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `outputs/x-media-viewer`. Pin the extension, open an X timeline, and press **X**. The built extension has no runtime package dependencies.

After rebuilding, click **Reload** on the extension’s card and refresh existing X tabs. See [installation and controls](docs/INSTALL.md) for details.

## Controls

| Key                               | Action                                         |
| --------------------------------- | ---------------------------------------------- |
| X                                 | Open / close viewer                            |
| ↑ / ↓, ← / →, W / S, A / D, K / J | Previous / next image or video                 |
| Wheel or vertical swipe           | Previous / next image or video                 |
| M or E                            | Mute / unmute                                  |
| Space                             | Play / pause video                             |
| Z or Zen button                   | Toggle zen mode                                |
| F                                 | Toggle browser fullscreen                      |
| R                                 | Retry failed media                             |
| Esc                               | Close viewer; Chrome may first exit fullscreen |

Shortcuts ignore text fields, text composition, and Ctrl/Command/Alt combinations. Zen mode hides the viewer interface and video controls while preserving keyboard shortcuts. It is remembered in the current tab until refresh.

## Loading and limitations

The compact counter, such as **1/12**, shows the displayed item and how many media items have been discovered. The total is not the number downloaded or the total on X. Photos are decoded before display. Videos require available frames, a decoded poster, and three seconds buffered, or the remaining duration for short clips. A ready video can still rebuffer later on a slow connection.

The viewer prepares three media downloads at a time, prioritizes the selected item, and retains ten ahead and two behind. It scrolls X underneath to discover more posts. If discovery stalls, press next at the end to retry. Unavailable media can be skipped. External embeds and live streams without an MP4 source are unsupported.

X can remove older timeline cards while loading new ones. On close, the viewer aligns the displayed post below X’s header; if its card is absent, it returns to the recorded position and waits briefly for the card to reappear. Layout changes can make that fallback approximate.

X can change its page structure and video responses, so compatibility requires ongoing live checks. The automated suite exercises simulated timelines and media events; it does not prove current X compatibility. See [testing and release checks](docs/TESTING.md).

## Development

```sh
npm run check    # Formatting, build, and automated tests
npm run format   # Format source, tests, scripts, and documentation
npm run package  # Build and produce outputs/x-media-viewer.zip
```

- `src/` contains the extension source, manifest, markup, and styles.
- `scripts/` builds the browser scripts and creates a release ZIP from an explicit file list.
- `tests/` contains synthetic timeline and media regression checks.
- `outputs/` contains generated install and release files; it is ignored by Git.
- `work/` is ignored local scratch space.

The viewer runs in Chrome’s isolated content-script world. A separate script in the page’s main world observes copies of X’s existing video responses. Both bundle one shared media helper source independently, so they need no shared global or load-order dependency. Only development tools use npm dependencies.

See [privacy](PRIVACY.md) and [contributing](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).
