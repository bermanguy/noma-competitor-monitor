#!/usr/bin/env python3
"""Join the demo video: a title slide, then the scene clip, for scenes 1 to 9.

Put your recordings in clips/ named scene-01.mp4 ... scene-09.mp4 (.mov, .webm or .m4v work too).
If you recorded a scene more than once, keep only the take you want under that name.

    python3 stitch.py                 # everything -> out/demo.mp4
    python3 stitch.py --only 6        # just slide 6 + scene 6, to check one scene quickly
    python3 stitch.py --no-slides     # clips only

Each clip is trimmed to just before your first word and just after your last word (silence at the
ends is cut). To set the cut points by hand, put them in trims.json, in seconds:
    {"6": {"start": 2.5, "end": 130.0}}

Needs only ffmpeg (Mac: brew install ffmpeg) and Python 3.
"""
import argparse, json, re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H, FPS = 1920, 1080, 30
EXTS = (".mp4", ".mov", ".webm", ".m4v", ".mkv")
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit(f"ffmpeg failed:\n{' '.join(cmd)}\n{p.stderr[-2000:]}")
    return p


def duration(path):
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).stdout
    return float(out.strip())


def has_audio(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)]).stdout
    return bool(out.strip())


def speech_bounds(path, total):
    """First and last moment that isn't silence, padded so words aren't clipped."""
    p = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "silencedetect=noise=-38dB:d=0.6", "-f", "null", "-"],
                       capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", p.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", p.stderr)]
    start, end = 0.0, total
    if starts and starts[0] < 0.3 and ends:   # clip opens with silence
        start = max(0.0, ends[0] - 0.4)
    closes_silent = len(ends) < len(starts) or (ends and starts and ends[-1] >= total - 0.3 and starts[-1] > start)
    if closes_silent:                          # clip closes with silence that runs to the end
        end = min(total, starts[-1] + 0.7)
    if end - start < 1.0:                      # detection failed (e.g. no sound): keep the whole clip
        return 0.0, total
    return start, end


def fit():
    return (f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,"
            f"setsar=1,fps={FPS},format=yuv420p")


def make_slide(png, seconds, dest):
    fade = 0.35
    run(["ffmpeg", "-y", "-loop", "1", "-t", str(seconds), "-i", str(png),
         "-f", "lavfi", "-t", str(seconds), "-i", "anullsrc=r=48000:cl=stereo",
         "-vf", f"{fit()},fade=in:st=0:d={fade},fade=out:st={seconds - fade}:d={fade}",
         "-shortest", *ENC, str(dest)])


def make_scene(src, start, end, dest):
    length = end - start
    fade = 0.25
    vf = f"{fit()},fade=in:st=0:d={fade},fade=out:st={length - fade}:d={fade}"
    af = f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=in:st=0:d={fade},afade=out:st={length - fade}:d={fade},aresample=48000"
    cmd = ["ffmpeg", "-y", "-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", str(src)]
    if not has_audio(src):
        cmd += ["-f", "lavfi", "-t", f"{length:.2f}", "-i", "anullsrc=r=48000:cl=stereo"]
        af = "anull"
        cmd += ["-map", "0:v", "-map", "1:a"]
    cmd += ["-vf", vf, "-af", af, *ENC, str(dest)]
    run(cmd)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clips", default=str(HERE / "clips"))
    ap.add_argument("--out", default=str(HERE / "out" / "demo.mp4"))
    ap.add_argument("--only", type=int, help="build just this scene number")
    ap.add_argument("--no-slides", action="store_true")
    ap.add_argument("--slide-seconds", type=float, default=3.0)
    ap.add_argument("--no-trim", action="store_true", help="keep each clip whole")
    a = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg isn't installed. On a Mac: brew install ffmpeg")
    clips, out = Path(a.clips), Path(a.out)
    work = out.parent / "parts"
    work.mkdir(parents=True, exist_ok=True)
    trims_file = HERE / "trims.json"
    trims = json.loads(trims_file.read_text()) if trims_file.exists() else {}

    scenes = [a.only] if a.only else range(1, 10)
    parts = []
    for n in scenes:
        src = next((clips / f"scene-{n:02d}{e}" for e in EXTS if (clips / f"scene-{n:02d}{e}").exists()), None)
        if not src:
            print(f"scene {n}: no clip in {clips}, skipped")
            continue
        if not a.no_slides:
            slide = work / f"{n:02d}a-slide.mp4"
            make_slide(HERE / "slides" / f"slide-{n:02d}.png", a.slide_seconds, slide)
            parts.append(slide)
        total = duration(src)
        start, end = (0.0, total) if a.no_trim else speech_bounds(src, total)
        t = trims.get(str(n), {})
        start, end = float(t.get("start", start)), float(t.get("end", end))
        scene = work / f"{n:02d}b-scene.mp4"
        make_scene(src, start, end, scene)
        parts.append(scene)
        print(f"scene {n}: {src.name}, kept {start:.1f}s to {end:.1f}s ({end - start:.0f}s of {total:.0f}s)")

    if not parts:
        sys.exit("Nothing to join.")
    if a.only:
        out = out.with_name(f"scene-{a.only:02d}-check.mp4")
    listing = work / "list.txt"
    listing.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", "-movflags", "+faststart", str(out)])
    d = duration(out)
    print(f"\nDone: {out}  ({int(d // 60)}:{int(d % 60):02d})")


if __name__ == "__main__":
    main()
