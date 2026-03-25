# CLAUDE.md — Agent Instructions for what-to-click

## Rules

1. **Always read `wip.md` before starting any task.** It contains the current work-in-progress state, known bugs, and architectural notes that must be kept in mind.

2. After completing any meaningful task (bug fix, feature, investigation), update `wip.md` to reflect the new state.

3. **Extension root is `src/`.** All paths in the manifest and service worker are relative to `src/`. Never confuse workspace-relative paths with extension-relative paths.

4. **Do not use `browser.*` APIs.** This is a Chrome MV3 extension. All APIs must use `chrome.*`.

5. **The background is a service worker**, not a background page. `importScripts()` works, `window` does not exist, and `fetch(data:URL)` is unreliable — use direct base64 decoding instead.

6. **`chrome.action.setIcon` does not accept SVG files.** Use `{ imageData }` with an `OffscreenCanvas`-rendered bitmap, or use PNG files. Same restriction applies to dynamically setting the icon at runtime. Additionally, `createImageBitmap` in a service worker **cannot decode SVG blobs** — it throws `InvalidStateError`. Draw icons programmatically onto `OffscreenCanvas` instead.

7. **Content scripts are plain scripts** (not modules). Files loaded with `<script type="module">` only exist in `page.html` (the editor page), not in `content/index.js`.

7. Keep changes minimal and targeted. Do not refactor code not directly related to the task.
