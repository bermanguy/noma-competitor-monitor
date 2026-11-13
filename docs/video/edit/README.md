# Recording and editing the demo video

Record nine short clips, one per scene, then run one command that adds the title slides and joins them. No video editor is needed. The words and clicks for each scene are in [../script.md](../script.md), and the words alone are in [../teleprompter.txt](../teleprompter.txt).

## The plan

| Scenes | What you record |
| --- | --- |
| 1 and 9 (opening and close) | **Camera only.** Your face full screen, reading from the prompter. |
| 2 to 8 | **Screen and camera together**, in the same recording, with the camera circle on. The script says where to put the circle in each scene. |

Recording the screen and your face together keeps your words in sync with your clicks. Don't record your voice first and the screen later: then you'd have to click in time with audio that's already recorded.

In scene 6, pause the recording while the Save check runs (about 2 minutes), and resume when the result appears.

## Set up once (15 minutes)

- **Recorder:** 1080p, 30 fps. Save each clip as MP4 or MOV.
- **Screen:** 16:9 if your recorder lets you pick an area (1920 × 1080). A full Mac screen is 16:10, which is fine too: it just gets thin dark bars on the sides.
- **Browser:** zoom 125%, hide bookmarks, close other tabs, sign in to the live site.
- **Slack:** open the channels you'll use, in order: product, marketing, owner, ops.
- **Mac:** turn on Do Not Disturb, and hide the Dock.
- **Sound:** use the same microphone, room and distance for every clip, so the clips sound alike when joined.
- **Clipboard:** copy the scene 6 sentence: *New cloud regions and data residency options are Worth knowing, not Urgent.*

## For each scene (about 5 minutes each)

1. Put the screen in the scene's starting state (the first line under **Screen** in the script).
2. Scroll the prompter to the scene.
3. Start recording. **Wait one second in silence.** Read the scene. **After the last word, wait one second.** Stop.
4. Watch the first and last 10 seconds of the clip. If it's fine, move on. If you stumbled, record it again. Two takes at most: good enough beats perfect.
5. Save the take you keep as `clips/scene-01.mp4` … `clips/scene-09.mp4` in this folder (`.mov` is fine too).

The silent second at each end gives the script a clean place to cut. It removes the silence for you, so you don't need to trim anything.

## Edit (about 15 minutes)

You need ffmpeg once: `brew install ffmpeg`.

```bash
cd docs/video/edit
python3 stitch.py              # everything -> out/demo.mp4
python3 stitch.py --only 6     # just slide 6 + scene 6, to check one scene fast
```

It makes each title slide 3 seconds long, cuts the silence at both ends of each clip, matches the size and loudness, fades between parts, and joins everything in order: slide 1, scene 1, slide 2, scene 2, and so on. A missing clip is skipped, so you can check the video while you're still recording.

**Music (optional).** Pick one calm instrumental track (no vocals, no strong beat), for example from the YouTube Audio Library or Pixabay Music, and add it with `--music`:

```bash
python3 stitch.py --music ~/Downloads/track.mp3
```

The music plays at normal volume on each title slide, eases down to almost nothing while you talk, and fades out at the end. Try `--music-low 0` for music on the slides only, or raise `--music-high` if it's too quiet on the slides. Make it once with music and once without, and keep the one that sounds better.

If a cut lands in the wrong place, set it by hand in `trims.json`, in seconds from the start of the clip, then run it again:

```json
{ "6": { "start": 2.5, "end": 131.0 } }
```

Or open Claude Code in the repo and say: *"Run docs/video/edit/stitch.py and check the result."*

The clips and the output stay on your computer: `clips/` and `out/` are not committed.

## Title slides

`slides/slide-01.png` to `slide-09.png` are ready to use. To change a title, edit `slides.json` and run `node make-slides.cjs` (needs Playwright), or ask Claude Code to do it.

## Timeline

| When | What | Time |
| --- | --- | --- |
| Saturday evening | Checks from "Before you record" in the script, then a dry run without pressing Save | 20 min |
| | Record the 9 clips | 45 min |
| | Run the edit and watch it once | 20 min |
| Sunday 9:00 | Fix any scene that needs it, run the edit again | up to 60 min |
| Sunday by 11:00 | Submit | |
