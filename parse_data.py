#!/usr/bin/env python3
"""Parse segment and transcript TXT files into topic.json"""
import json
import re

def parse_time(t):
    """Parse M:SS or MM:SS to seconds"""
    parts = t.strip().split(':')
    return int(parts[0]) * 60 + int(parts[1])

def split_sentences(text):
    """Split text into sentences, handling common abbreviations."""
    # Split on period followed by space and uppercase letter, or end of string
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z`\'\"/])', text.strip())
    return [p.strip() for p in parts if p.strip()]

def parse_segments(filepath, video_id, start_seg_num):
    """Parse Segments.txt -> list of segment dicts with bullets"""
    with open(filepath, 'r') as f:
        text = f.read()

    # Split into blocks separated by blank lines
    blocks = re.split(r'\n\n+', text.strip())

    segments = []
    time_pattern = r'^(\d+:\d+)\s+(.+?)$'

    for block in blocks:
        lines = block.strip().split('\n')
        if not lines:
            continue
        m = re.match(time_pattern, lines[0])
        if not m:
            continue

        start = parse_time(m.group(1))
        label = m.group(2).strip()

        # Description is the rest of the block (lines after the title)
        desc_text = ' '.join(lines[1:]).strip()
        sentences = split_sentences(desc_text) if desc_text else []

        # Use sentences as bullets, skip any that just restate the title
        label_words = set(label.lower().split())
        bullets = []
        for sent in sentences:
            sent_words = set(sent.lower().split())
            # Skip if >60% overlap with title words (too repetitive)
            overlap = len(label_words & sent_words) / max(len(label_words), 1)
            if overlap < 0.6:
                bullets.append(sent)
            if len(bullets) >= 3:
                break

        # If we filtered everything, just use all sentences up to 3
        if not bullets and sentences:
            bullets = sentences[:3]

        segments.append({
            "label": label,
            "start": start,
            "bullets": bullets,
            "_videoId": video_id,
        })

    # Compute end times and IDs
    result = []
    for i, seg in enumerate(segments):
        if i + 1 < len(segments):
            end = segments[i + 1]["start"]
        else:
            end = seg["start"] + 120  # placeholder

        result.append({
            "id": f"seg-{start_seg_num + i:03d}",
            "videoId": seg["_videoId"],
            "label": seg["label"],
            "start": seg["start"],
            "end": end,
            "bullets": seg["bullets"]
        })

    return result

def parse_transcript(filepath):
    """Parse Speech to Text.txt -> list of transcript chunk dicts (speaker ignored)"""
    with open(filepath, 'r') as f:
        text = f.read()

    chunks = []
    pattern = r'\[\w+\]\s+(\d+:\d+)\s*-\s*(\d+:\d+)\s*\n\s*(.+?)(?=\n\n|\n\[|\Z)'

    for m in re.finditer(pattern, text, re.DOTALL):
        start = parse_time(m.group(1))
        end = parse_time(m.group(2))
        t = re.sub(r'\s+', ' ', m.group(3)).strip()
        chunks.append({"start": start, "end": end, "text": t})

    return chunks

base = "/Users/alexander.kitov/Desktop/E2T Demos/Video Demo"

v1_segs = parse_segments(f"{base}/Video 1 - Segments.txt", "vid-1", 1)
v2_segs = parse_segments(f"{base}/Video 2 - Segments.txt", "vid-2", len(v1_segs) + 1)

v1_trans = parse_transcript(f"{base}/Video 1 - Speech to Text.txt")
v2_trans = parse_transcript(f"{base}/Video 2 - Speech to Text.txt")

if v1_trans:
    v1_segs[-1]["end"] = max(c["end"] for c in v1_trans)
if v2_trans:
    v2_segs[-1]["end"] = max(c["end"] for c in v2_trans)

topic = {
    "topic": {
        "title": "Claude Code Mastery",
        "description": "Best tips from 2 expert talks on Claude Code"
    },
    "videos": [
        {"id": "vid-1", "youtubeId": "6eBSHbLKuN0", "title": "Mastering Claude Code in 30 Minutes"},
        {"id": "vid-2", "youtubeId": "mZzhfPle9QU", "title": "50 Claude Code Tips"}
    ],
    "segments": v1_segs + v2_segs,
    "transcripts": {
        "vid-1": v1_trans,
        "vid-2": v2_trans
    }
}

print(f"Video 1: {len(v1_segs)} segments, {len(v1_trans)} transcript chunks")
print(f"Video 2: {len(v2_segs)} segments, {len(v2_trans)} transcript chunks")
print(f"Total segments: {len(v1_segs) + len(v2_segs)}")
total = sum(s["end"] - s["start"] for s in topic["segments"])
print(f"Total virtual duration: {total//60}m {total%60}s")

# Show bullet counts
for s in topic["segments"]:
    print(f"  {s['id']} [{len(s['bullets'])} bullets] {s['label']}")

with open(f"{base}/topic.json", 'w') as f:
    json.dump(topic, f, indent=2)

print("\nWritten topic.json")
