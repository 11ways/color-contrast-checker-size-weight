# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Elly Contrast Checker" — a Chrome extension (Manifest V3) and standalone web tool that checks color contrast ratios against WCAG AA standards (SC 1.4.3 for text, SC 1.4.11 for non-text/UI). It runs as a Chrome side panel and also has a standalone HTML page (`index.html`).

## Architecture

- **No build system or bundler.** All source files are vanilla HTML/CSS/JS served directly.
- **Two entry points:**
  - `popup.html` + `popup.js` + `popup.css` — the Chrome extension side panel UI (styles are inlined in `popup.html`)
  - `index.html` — standalone web version (self-contained, all CSS/JS inlined)
- `background.js` — minimal service worker that enables the side panel on extension icon click
- `manifest.json` — Manifest V3 config; uses `sidePanel` permission
- `lib/` — vendored third-party: Coloris color picker (`coloris.min.js`, `coloris.min.css`)
- `icons/` — extension icons (16/48/128px)

## Key Implementation Details

- **Contrast calculation** follows WCAG 2.x relative luminance formula (`getLuminance` + `getContrastRatio` in `popup.js`)
- **Alpha compositing** — foreground colors support alpha; they are flattened against the background before contrast calculation
- **Suggestion engine** — when contrast fails, `generateSuggestions()` finds passing alternatives by adjusting: foreground lightness, background lightness, or alpha opacity
- **Color format toggle** — cycles between HEX, RGB, and HSL display formats
- **Font size/weight awareness** — determines "large text" threshold (24px/18.5px bold for px; 18pt/14pt bold for pt) to pick the correct ratio requirement (3.0 vs 4.5)
- **Favourites/history** — passing combinations can be saved in-memory (not persisted across sessions)
- **Audio feedback** — optional pass/fail tones via Web Audio API

## Development

To test the extension locally:
1. Open `chrome://extensions/` with Developer Mode enabled
2. "Load unpacked" pointing to this directory
3. Click the extension icon to open the side panel

To test the standalone version: open `index.html` directly in a browser.

## Linting

- `npm run lint` — run ESLint
- `npm run lint:fix` — auto-fix fixable issues

ESLint config is in `eslint.config.mjs`. The `lib/` directory (vendored dependencies) is excluded from linting.
