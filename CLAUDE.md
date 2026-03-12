# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run the recorder (uses tsx, no build step needed)
npm run dev        # Run with watch mode (auto-restart on file changes)
npm run build      # Compile TypeScript to dist/
npm run type-check # Type-check without emitting files
npm run clean      # Remove dist/
```

There are no tests or lint scripts.

## Architecture

The project is a Selenium-based browser automation tool that records user interactions and organizes them into BDD-style Given/When/Then stages for generating test context for LLMs.

**Entry point:** `src/index.ts` instantiates `TestRecorder` and calls `run()`.

**Core class:** `src/test-recorder.ts` — `TestRecorder` manages the entire lifecycle:
- Opens Chrome via Selenium WebDriver and navigates to `base_url` from `config.json`
- Injects a JavaScript snippet into every page that: captures click/input events into `localStorage`, and renders a draggable popup UI for stage switching
- Polls the browser every 1 second, draining `localStorage.clickedElements` and `localStorage.inputEvents` into in-memory maps keyed by URL
- Stage changes can come from two sources: terminal keypresses (G/W/T) or the in-browser popup (which writes to `localStorage.stageChange`, picked up on the next poll cycle)
- On shutdown (Ctrl+C or browser close), prints a report grouped by stage then by URL

**HTML simplification:** `src/element-simplifier.ts` — uses `cheerio` to strip captured `outerHTML` down to tag + allowed attributes (`id`, `class`, `name`, `type`, `href`, `placeholder`, `role`, plus `data-*` and `test-*`) + inner text. Cap of 40 chars per attribute value.

**Types:** `src/types.ts` — shared interfaces: `Config`, `ClickedElement`, `InputEvent`, `RecordedEvent`, `StageEvents`, `PageMap<T>`, `RecordingStage`.

## Configuration

`config.json` (not committed as a template but required at runtime):
```json
{ "base_url": "https://your-site.com" }
```

## Key Design Details

- The injected JS uses `window.__testRecorderInjected` as a guard to avoid double-injection on URL changes.
- Stage switching saves all current-stage events to `this.stageEvents[]` and resets `pageEventsMap` for fresh tracking.
- The final report deduplicates by element identity (prefers `id`, then `name`, then `type`+`placeholder`), keeping only the last recorded event per element per page.
- URL simplification strips semicolon parameters and 32+ char hex path segments (UUIDs).
- TypeScript is strict (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, etc.).
