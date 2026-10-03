"""Assemble a CDP screencast (frames + capture times) into an MP4 with true
timing. Each frame is held until the next one arrived, so the video plays at
the speed the app actually rendered."""
import json
import os
import subprocess
import sys
from pathlib import Path

rec = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/teleport-rec")
out = Path(sys.argv[2] if len(sys.argv) > 2 else "/workspace/plans/teleport-film/teleport-real-app.mp4")
frames = json.loads((rec / "frames.json").read_text())
# A screencast frame only arrives when pixels change, so a provisioning wait
# is one frame held for minutes. MAX_HOLD_MS shortens such holds; no frame is
# added, removed, or altered.
MAX_HOLD_S = float(os.environ.get("MAX_HOLD_MS", "1e12")) / 1000
if not frames:
    raise SystemExit("no frames recorded")

lines = []
for i, frame in enumerate(frames):
    nxt = frames[i + 1]["t"] if i + 1 < len(frames) else frame["t"] + 2500
    duration = max(0.04, min((nxt - frame["t"]) / 1000, MAX_HOLD_S))
    lines.append(f"file '{frame['file']}'")
    lines.append(f"duration {duration:.3f}")
lines.append(f"file '{frames[-1]['file']}'")
concat = rec / "concat.txt"
concat.write_text("\n".join(lines) + "\n")

subprocess.run([
    "ffmpeg", "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", str(concat),
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-movflags", "+faststart",
    str(out),
], check=True)
total = (frames[-1]["t"] - frames[0]["t"]) / 1000 + 2.5
print(f"{len(frames)} frames → {out} ({total:.1f}s)")
