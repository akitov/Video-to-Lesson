# Plan: Interactive Topic-Based Video Learning Player

## Context

We need a self-contained HTML/JS/CSS application that lets users learn by topic across 2 YouTube videos rather than watching entire videos. The app plays curated excerpt segments in sequence and restricts playback to only those segments.

**Real videos:**
- Video 1: `6eBSHbLKuN0` — "Mastering Claude Code in 30 Minutes" (Boris Cherny, Anthropic) — 14 segments, ~28 min
- Video 2: `mZzhfPle9QU` — "50 Claude Code Tips" — 25 segments, ~46 min

**Per-video metadata (source files in `/Users/alexander.kitov/Desktop/E2T Demos/Video Demo/`):**
- `Video 1 - Segments.txt` / `Video 2 - Segments.txt` — topic segments with start time + description
- `Video 1 - Speech to Text.txt` / `Video 2 - Speech to Text.txt` — timestamped transcript chunks `[SPEAKER_XX] M:SS - M:SS\n text`

**Reference product:** [Longcut.ai](https://www.longcut.ai) (open source: [github.com/SamuelZ12/longcut](https://github.com/SamuelZ12/longcut)). Key differences:
- Longcut: single video, native YouTube controls visible, no seek restriction, React/Next.js app
- Our app: **2 videos**, **seek restriction** enforced, **self-contained HTML** file, **transcript search/filter**

**Constraints:**
- Videos are both YouTube (public)
- 1-3s delay when switching between videos is acceptable
- Plain HTML/JS/CSS only, loading YouTube IFrame API from CDN

---

## Feasibility (YouTube IFrame API)

| Capability | Status |
|---|---|
| Seek to specific time | `seekTo(s, true)` — works |
| Detect current time | Poll `getCurrentTime()` every 100ms (no native timeupdate event) |
| Hide native controls | `controls=0` — free, all accounts |
| Disable keyboard seek | `disablekb=1` — works |
| API key required | No |
| Works on `file://` | No — needs HTTP server (`python3 -m http.server`) |

**Both tasks are fully achievable with YouTube.** Vimeo adapter can be added later if needed.

---

## Recommended Approach: Custom YouTube Player

Single `index.html` with inline CSS/JS. Loads only YouTube IFrame API from CDN. No other dependencies.

### Architecture

```
index.html (single file, ~800-1000 lines)
├── YouTubeAdapter   — wraps YT.Player, 100ms poll, state events
├── SegmentEngine    — virtual timeline, boundary detection, segment transitions
├── Controls         — custom play/pause, virtual seekbar, segment markers, time display
├── TranscriptPanel  — synced transcript with search/filter bar
├── SegmentList      — sidebar clickable segment cards
└── App              — loads topic.json, wires everything together
```

### Core Design Elements

**1. YouTube adapter** — wraps YT.Player with `controls=0, disablekb=1`:
```
adapter.play() / pause() / seekTo(seconds) / destroy()
adapter.onTimeUpdate(callback)  // 100ms poll of getCurrentTime()
adapter.onStateChange(callback) // 'playing' | 'paused' | 'ended' | 'buffering'
```

**2. Virtual timeline** — Maps `[0..totalSegmentDuration]` to actual `[start..end]` ranges across videos:
```
Segments: [vid1 0:00-1:28] [vid1 1:28-2:56] ... [vid2 0:00-1:17] [vid2 1:17-1:55] ...
Virtual:  [0:00------1:28] [1:28------4:24] ... [X:XX------Y:YY] [Y:YY------Z:ZZ] ...
```
The custom seekbar shows total virtual duration. `virtualToAbsolute()` and `absoluteToVirtual()` convert between timelines.

**3. Segment boundary detection** — 100ms polling checks `getCurrentTime() >= segment.end`. On boundary:
- **Same video:** `adapter.seekTo(nextSegment.start)` — instant
- **Different video:** Destroy current player, create new YT.Player for new videoId, seek to start. User sees 1-3s loading.

**4. Seek restriction (layered defense):**
1. Custom seekbar maps only the virtual range — no UI affordance to seek outside segments
2. `controls=0` hides native YouTube seekbar
3. `disablekb=1` blocks keyboard seeking
4. Snap-back defense: if poll detects position outside current segment, immediately seek back

**5. Transcript panel with search/filter:**
- Shows Speech-to-Text chunks synced to playback
- Active chunk auto-highlighted (scrolled into view) based on current absolute time
- **Search bar on top** — filters transcript chunks to only those containing the search string (exact match, case-insensitive)
- Clicking a visible transcript chunk seeks within the current segment (if within bounds)

**6. Segment list sidebar** — Clickable cards showing segment labels with durations. Active segment highlighted. Clicking jumps to that segment.

### Playback Modes

| Mode | Behavior |
|---|---|
| **Play All** | Plays all segments in sequence, auto-advancing across segment and video boundaries |
| **Play Segment** | Click a segment card → seeks to that segment, plays it, pauses at its end |

---

## Data Format — `topic.json`

```json
{
  "topic": {
    "title": "Claude Code Mastery",
    "description": "Best tips from 2 expert talks on Claude Code"
  },
  "videos": [
    {
      "id": "vid-1",
      "youtubeId": "6eBSHbLKuN0",
      "title": "Mastering Claude Code in 30 Minutes"
    },
    {
      "id": "vid-2",
      "youtubeId": "mZzhfPle9QU",
      "title": "50 Claude Code Tips"
    }
  ],
  "segments": [
    {
      "id": "seg-001",
      "videoId": "vid-1",
      "label": "Introduction to Claude Code",
      "start": 0,
      "end": 88
    }
  ],
  "transcripts": {
    "vid-1": [
      { "start": 0, "end": 24, "speaker": "SPEAKER_00", "text": "Hello. Hey everyone. I'm Boris..." }
    ],
    "vid-2": [
      { "start": 0, "end": 5, "speaker": "SPEAKER_00", "text": "Well, hello there..." }
    ]
  }
}
```

**Source file parsing:**
- **Segments.txt**: Format is `M:SS Label\nDescription paragraph`. Parse `M:SS` as start time. End time = next segment's start time (last segment: use video duration or a reasonable estimate).
- **Speech to Text.txt**: Format is `[SPEAKER_XX] M:SS - M:SS\n text`. Parse into `{ start, end, speaker, text }` objects.

- Segment order in array = playback sequence
- Times are absolute video seconds
- Transcripts keyed by videoId for efficient lookup

---

## Files to Create

| File | Purpose |
|---|---|
| `video-demo-plan.md` | This plan file |
| `index.html` | Complete self-contained application (~800-1000 lines) |
| `topic.json` | Real data: 2 videos, all 39 segments, all transcript chunks parsed from TXT files |

---

## Implementation Steps

1. **Parse source TXT files → `topic.json`** — Convert both Segments.txt and Speech to Text.txt into JSON format
2. **HTML shell + CSS layout** — Two-column layout (player + sidebar), custom controls bar, transcript panel with search
3. **YouTubeAdapter** — Load IFrame API, instantiate player with `controls=0`, 100ms poll loop, state change handling
4. **SegmentEngine** — Virtual timeline mapping, boundary detection, segment advancement, playback mode state
5. **Custom controls** — Play/pause button, virtual seekbar with segment markers, time display (virtual time)
6. **Seek restriction** — Snap-back defense in poll loop, keyboard blocking
7. **TranscriptPanel** — Render transcript chunks, auto-highlight on timeupdate, **search bar with exact-match filtering**, click-to-seek within segment
8. **SegmentList** — Render clickable segment cards, highlight active, click to jump
9. **App init** — Fetch `topic.json`, wire components, handle video switching

---

## Verification Plan

1. `python3 -m http.server 8080` in project directory
2. Open `http://localhost:8080/index.html`
3. Video starts at first segment's `start` time, not 0:00
4. When segment end is reached, playback jumps to next segment's start
5. When last segment ends, playback pauses
6. Custom seekbar shows virtual duration (sum of segments), not full video duration
7. Dragging seekbar only seeks within allowed segments
8. Keyboard shortcuts (arrows, space) don't escape segment bounds
9. Cross-video transition works (1-3s acceptable delay)
10. Transcript panel highlights current line in sync
11. Clicking a segment card jumps to that segment
12. Clicking "Play All" plays through all segments sequentially
