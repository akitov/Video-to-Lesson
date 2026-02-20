# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interactive topic-based video learning player that curates excerpt segments from two YouTube videos into a unified playlist. Users learn by topic rather than watching entire videos. Inspired by [Longcut.ai](https://www.longcut.ai) but differs: supports 2 videos, enforces seek restriction, and is a self-contained HTML file.

The current topic is "Claude Code Mastery" — segments from two talks: "Mastering Claude Code in 30 Minutes" (vid-1) and "50 Claude Code Tips" (vid-2).

## Running the App

```bash
# Serve locally (required — YouTube IFrame API won't work on file://)
python3 -m http.server 8080
# Open http://localhost:8080/index.html
```

The AI Search feature requires deployment to Vercel (uses `api/chat.js` serverless function) with `OAI_API_KEY` environment variable set.

## Regenerating Data

```bash
python3 parse_data.py
```

This parses `Video * - Segments.txt` and `Video * - Speech to Text.txt` files into `topic.json`. The script has a hardcoded base path that must match the working directory.

## Architecture

**Single-file frontend** (`index.html`, ~1000 lines): inline CSS + JS, no build step, no dependencies except YouTube IFrame API from CDN.

Three JS classes in `index.html`:
- **YouTubeAdapter** — wraps `YT.Player` with `controls=0, disablekb=1`. Polls `getCurrentTime()` every 100ms (YouTube has no native timeupdate event). Handles player lifecycle including destroy/recreate on video switch.
- **SegmentEngine** — manages a virtual timeline that maps continuous `[0..totalDuration]` to actual `[start..end]` ranges across both videos. Provides `virtualToAbsolute()` and `absoluteToVirtual()` conversion. Tracks playback mode (Play All vs Single).
- **App** — orchestrates everything. Renders the shell, binds controls, manages segment/transcript lists, handles AI search, and enforces seek restriction via snap-back defense (if player position drifts outside current segment bounds, it snaps back).

**Serverless API** (`api/chat.js`): Vercel serverless function that sends the full transcript + user query to OpenAI `gpt-4o-mini` to find relevant segments. Returns JSON with segment boundaries for the AI Search tab.

**Data pipeline** (`parse_data.py`): Parses segment descriptions and speech-to-text transcripts from plain text files into `topic.json`.

## Key Data Files

- `topic.json` — all app data: video metadata, segment definitions (id, videoId, label, start, end, bullets), and timestamped transcripts keyed by videoId
- `Video * - Segments.txt` — segment start times + labels + descriptions (source for parse_data.py)
- `Video * - Speech to Text.txt` — timestamped transcript chunks in format `[SPEAKER_XX] M:SS - M:SS\n text`

## Seek Restriction (Layered Defense)

The app prevents users from watching outside curated segments via:
1. Custom seekbar maps only virtual segment range
2. `controls=0` hides native YouTube seekbar
3. `disablekb=1` blocks keyboard seeking
4. Snap-back: if polling detects position outside current segment, immediately seeks back

## AI Search Tab

Sends full transcript to OpenAI, gets back custom segment boundaries (not from the predefined segments). These AI segments are played independently with their own boundary enforcement, bypassing the normal SegmentEngine snap-back.
