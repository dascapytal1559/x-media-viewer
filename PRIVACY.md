# Privacy

X Media Viewer runs on `https://x.com/*` and `https://www.x.com/*`. It reads rendered posts to display their media, captions, and original post links.

A script running in the page observes copies of GraphQL responses X has already requested. It extracts video URLs and poster URLs and keeps a bounded cache in the tab’s memory, including before the viewer opens. It does not inspect request cookies, authentication headers, or tokens, change the response X receives, or make separate X API requests.

The viewer requests images from `pbs.twimg.com` and MP4 video from `video.twimg.com` to display and preload media. These normal media requests are visible to X’s servers. Loading ahead also scrolls the underlying timeline, which can cause X itself to request more posts.

The extension does not send timeline content to an external service, include analytics, or use a backend. It does not save feed history in extension storage. Media playback resources are released when the viewer closes; cached post and URL data remain in tab memory until cleared or the tab closes. Chrome may independently cache downloaded media through its normal browser cache.

A viewer link opened with **Open post** navigates to X normally. The extension does not post, like, repost, follow, or send messages on your behalf.
