#!/usr/bin/env python3
"""Compose screen recordings and cards into a configurable silent demo video.

  film.py normalize raw.mov cfr.mp4      constant 30fps copy to find cut points in
  film.py compose film.json              render the film described by the spec
  film.py sheet film.mp4 sheet.jpg       8-frame contact sheet for review

Needs ffmpeg and Pillow. The spec format is documented in ../SKILL.md.
"""

import argparse
import json
import math
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


@dataclass(frozen=True)
class RenderSettings:
    width: int = 1080
    height: int = 1920
    fps: int = 30
    crf: int = 18
    fade: float = 0.35
    phone_width: float = 0.615
    phone_height: float = 0.82
    bezel_width: float = 0.015
    corner_radius: float = 0.137

    @classmethod
    def from_spec(cls, spec):
        values = spec.get("render", {})
        if not isinstance(values, dict):
            raise ValueError("render must be an object")
        unknown = values.keys() - cls.__dataclass_fields__.keys()
        if unknown:
            raise ValueError(f"Unknown render settings: {', '.join(sorted(unknown))}")
        settings = cls(**values)
        for name in ("width", "height", "fps", "crf"):
            value = getattr(settings, name)
            if type(value) is not int:
                raise ValueError(f"render.{name} must be an integer")
        if any(n < 64 or n % 2 for n in (settings.width, settings.height)):
            raise ValueError("render.width and render.height must be even and at least 64")
        if not 1 <= settings.fps <= 120 or not 0 <= settings.crf <= 51:
            raise ValueError("render.fps must be 1..120 and render.crf must be 0..51")
        number(settings.fade, "render.fade", minimum=0)
        for name in ("phone_width", "phone_height"):
            value = number(getattr(settings, name), f"render.{name}", minimum=0, exclusive=True)
            if value > 0.95:
                raise ValueError(f"render.{name} must be at most 0.95")
        for name in ("bezel_width", "corner_radius"):
            value = number(getattr(settings, name), f"render.{name}", minimum=0)
            if value > 0.25:
                raise ValueError(f"render.{name} must be at most 0.25")
        return settings

    @property
    def scale(self):
        return min(self.width / 1080, self.height / 1920)

    def pixels(self, value):
        return max(1, round(value * self.scale))

    def phone_size(self, src_w, src_h):
        bezel = round(min(self.width, self.height) * self.bezel_width)
        width = min(self.width * self.phone_width, self.width - 2 * bezel,
                    (min(self.height * self.phone_height, self.height - 2 * bezel)) * src_w / src_h)
        return max(2, int(width // 2) * 2), max(2, int(width * src_h / src_w // 2) * 2), bezel


def number(value, label, minimum=0, exclusive=False):
    if (type(value) not in (int, float) or not math.isfinite(value)
            or (value <= minimum if exclusive else value < minimum)):
        relation = "greater than" if exclusive else "at least"
        raise ValueError(f"{label} must be a finite number {relation} {minimum}")
    return value


def fades(settings, duration, color):
    duration = max(duration, 1 / settings.fps)
    fade = min(settings.fade, duration / 2)
    if fade == 0:
        return "format=yuv420p"
    return (f"fade=t=in:st=0:d={fade}:color={color},"
            f"fade=t=out:st={duration - fade}:d={fade}:color={color},format=yuv420p")


def output_path(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


SANS = ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
SERIF = ["/System/Library/Fonts/NewYork.ttf", "/System/Library/Fonts/Times.ttc",
         "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"]


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height:format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    if not data.get("streams"):
        raise ValueError(f"No video stream in {path}")
    stream = data["streams"][0]
    return stream["width"], stream["height"], float(data["format"]["duration"])


def font(candidates, size, override=None):
    for path in [override, *candidates]:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def centered(draw, canvas_width, y, text, fnt, fill):
    width = draw.textlength(text, font=fnt)
    draw.text(((canvas_width - width) / 2, y), text, font=fnt, fill=fill)


def normalize(src, dst, fps=30):
    if type(fps) is not int or not 1 <= fps <= 120:
        raise ValueError("fps must be an integer in 1..120")
    if Path(src).resolve() == Path(dst).resolve():
        raise ValueError("Source and output must be different files")
    run(["-i", str(src), "-vf", f"fps={fps}", "-an", "-c:v", "libx264",
         "-crf", "14", "-pix_fmt", "yuv420p", str(output_path(dst))])


def phone_layers(spec, label, src_w, src_h, work, index):
    settings = RenderSettings.from_spec(spec)
    width, height = settings.width, settings.height
    screen_w, screen_h, bezel = settings.phone_size(src_w, src_h)
    x, y = (width - screen_w) // 2, (height - screen_h) // 2
    radius = min(round(screen_w * settings.corner_radius), screen_h // 2)
    scale = 4

    frame = Image.new("RGB", (width, height), hex_rgb(spec.get("backdrop", "#F2F0EB")))
    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (x - bezel, y - bezel + settings.pixels(18), x + screen_w + bezel, y + screen_h + bezel + settings.pixels(18)),
        radius + bezel, fill=(0, 0, 0, 46))
    blurred = shadow.filter(ImageFilter.GaussianBlur(settings.pixels(28)))
    frame.paste(blurred, (0, 0), blurred)

    body = Image.new("RGBA", (width * scale, height * scale), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle(
        ((x - bezel) * scale, (y - bezel) * scale,
         (x + screen_w + bezel) * scale, (y + screen_h + bezel) * scale),
        (radius + bezel) * scale, fill=hex_rgb(spec.get("bezel", "#111113")) + (255,))
    body = body.resize((width, height), Image.LANCZOS)
    frame.paste(body, (0, 0), body)

    if label:
        draw = ImageDraw.Draw(frame)
        centered(draw, width, y - bezel - settings.pixels(58), label.upper(),
                 font(SANS, settings.pixels(22), spec.get("sansFont")), hex_rgb(spec.get("muted", "#8A8780")))

    mask = Image.new("L", (screen_w * scale, screen_h * scale), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, screen_w * scale - 1, screen_h * scale - 1), radius * scale, fill=255)
    mask = mask.resize((screen_w, screen_h), Image.LANCZOS)

    island_w, island_h = round(screen_w * 0.313), round(screen_w * 0.092)
    island = Image.new("RGBA", (width * scale, height * scale), (0, 0, 0, 0))
    ix, iy = (width - island_w) // 2, y + round(screen_w * 0.028)
    ImageDraw.Draw(island).rounded_rectangle(
        (ix * scale, iy * scale, (ix + island_w) * scale, (iy + island_h) * scale),
        island_h * scale // 2, fill=(0, 0, 0, 255))
    island = island.resize((width, height), Image.LANCZOS)

    paths = [work / f"{index}-{name}.png" for name in ("frame", "mask", "island")]
    frame.save(paths[0])
    mask.save(paths[1])
    island.save(paths[2])
    return paths, (x, y, screen_w, screen_h)


def render_phone(spec, seg, work, index, base):
    settings = RenderSettings.from_spec(spec)
    fps = settings.fps
    src = (base / seg["src"]).resolve()
    cfr = work / f"{index}-cfr.mp4"
    normalize(src, cfr, fps)
    src_w, src_h, duration = probe(cfr)
    start, end = seg.get("start", 0), seg.get("end", duration)
    speed = seg.get("speed", 1)
    length = (end - start) / speed
    (frame, mask, island), (x, y, screen_w, screen_h) = phone_layers(
        spec, seg.get("label"), src_w, src_h, work, index)
    backdrop = spec.get("backdrop", "#F2F0EB").replace("#", "0x")
    hide_island = seg.get("island", True) is False

    graph = (
        f"[0:v]trim={start}:{end},setpts=(PTS-STARTPTS)/{speed},fps={fps},"
        f"scale={screen_w}:{screen_h}:flags=lanczos,format=rgba[v];"
        f"[2:v]format=gray[m];[v][m]alphamerge[screen];"
        f"[1:v][screen]overlay={x}:{y}:shortest=1[p];"
        + ("[p]null[c];" if hide_island else "[p][3:v]overlay=0:0[c];")
        + f"[c]{fades(settings, length, backdrop)}[out]"
    )
    out = work / f"{index}-seg.mp4"
    run(["-i", str(cfr), "-loop", "1", "-i", str(frame), "-loop", "1", "-i", str(mask),
         "-loop", "1", "-i", str(island), "-filter_complex", graph, "-map", "[out]",
         "-t", f"{length:.3f}", "-r", str(fps), "-c:v", "libx264", "-crf", "16", str(out)])
    return out


def render_raw(spec, seg, work, index, base):
    settings = RenderSettings.from_spec(spec)
    width, height, fps = settings.width, settings.height, settings.fps
    cfr = work / f"{index}-cfr.mp4"
    normalize((base / seg["src"]).resolve(), cfr, fps)
    _, _, duration = probe(cfr)
    start, end = seg.get("start", 0), seg.get("end", duration)
    speed = seg.get("speed", 1)
    out = work / f"{index}-seg.mp4"
    run(["-i", str(cfr), "-vf",
         f"trim={start}:{end},setpts=(PTS-STARTPTS)/{speed},fps={fps},"
         f"scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,"
         f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p",
         "-r", str(fps), "-c:v", "libx264", "-crf", "16", str(out)])
    return out


def wrap(draw, text, fnt, max_width):
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=fnt) <= max_width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    return [*lines, line]


def render_still(spec, image, duration, work, index):
    settings = RenderSettings.from_spec(spec)
    fps = settings.fps
    backdrop = spec.get("backdrop", "#F2F0EB").replace("#", "0x")
    png = work / f"{index}-still.png"
    image.save(png)
    out = work / f"{index}-seg.mp4"
    run(["-loop", "1", "-i", str(png), "-vf",
         fades(settings, duration, backdrop),
         "-t", f"{duration:.3f}", "-r", str(fps), "-c:v", "libx264", "-crf", "16", str(out)])
    return out


def render_card(spec, seg, work, index, base):
    settings = RenderSettings.from_spec(spec)
    width, height = settings.width, settings.height
    px = settings.pixels
    canvas = Image.new("RGB", (width, height), hex_rgb(spec.get("backdrop", "#F2F0EB")))
    draw = ImageDraw.Draw(canvas)
    ink, muted = hex_rgb(spec.get("ink", "#1B1A18")), hex_rgb(spec.get("muted", "#8A8780"))
    margin, y = px(110), round(height * (0.17 if seg.get("image") else 0.4))
    if seg.get("eyebrow"):
        draw.text((margin, y), seg["eyebrow"].upper(), font=font(SANS, px(24), spec.get("sansFont")), fill=muted)
        y += px(64)
    title_font = font(SERIF, px(76), spec.get("titleFont"))
    for line in wrap(draw, seg.get("title", ""), title_font, width - margin * 2):
        draw.text((margin, y), line, font=title_font, fill=ink)
        y += px(92)
    if seg.get("caption"):
        draw.text((margin, y + px(8)), seg["caption"], font=font(SANS, px(30), spec.get("sansFont")), fill=muted)
        y += px(60)
    if seg.get("image"):
        shot = Image.open((base / seg["image"]).resolve()).convert("RGB")
        box_w, box_h = width - margin * 2, height - y - px(260)
        if box_h <= 0:
            raise ValueError("Card text leaves no room for its image; shorten the text")
        ratio = min(box_w / shot.width, box_h / shot.height)
        shot = shot.resize((round(shot.width * ratio), round(shot.height * ratio)), Image.LANCZOS)
        image_x, image_y = (width - shot.width) // 2, y + px(70)
        shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            (image_x, image_y + px(16), image_x + shot.width, image_y + shot.height + px(16)), px(20), fill=(0, 0, 0, 50))
        blurred = shadow.filter(ImageFilter.GaussianBlur(px(26)))
        canvas.paste(blurred, (0, 0), blurred)
        corner = Image.new("L", shot.size, 0)
        ImageDraw.Draw(corner).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1), px(20), fill=255)
        canvas.paste(shot, (image_x, image_y), corner)
    if seg.get("footer"):
        draw.text((margin, height - px(190)), seg["footer"], font=font(SANS, px(24), spec.get("sansFont")), fill=muted)
    return render_still(spec, canvas, seg.get("duration", 4), work, index)


def render_end(spec, seg, work, index, base):
    settings = RenderSettings.from_spec(spec)
    width, height = settings.width, settings.height
    px = settings.pixels
    canvas = Image.new("RGB", (width, height), hex_rgb(spec.get("backdrop", "#F2F0EB")))
    draw = ImageDraw.Draw(canvas)
    if seg.get("logo"):
        logo = Image.open((base / seg["logo"]).resolve()).convert("RGBA")
        ratio = min(px(520) / logo.width, px(220) / logo.height)
        logo = logo.resize((round(logo.width * ratio), round(logo.height * ratio)), Image.LANCZOS)
        canvas.paste(logo, ((width - logo.width) // 2, (height - logo.height) // 2 - px(40)), logo)
        text_y = (height + logo.height) // 2 + px(10)
    else:
        mark = font(SERIF, px(104), spec.get("titleFont"))
        centered(draw, width, height // 2 - px(90), seg.get("wordmark", "Superset"), mark, hex_rgb(spec.get("ink", "#1B1A18")))
        text_y = height // 2 + px(60)
    if seg.get("caption"):
        centered(draw, width, text_y, seg["caption"], font(SANS, px(32), spec.get("sansFont")),
                 hex_rgb(spec.get("muted", "#8A8780")))
    return render_still(spec, canvas, seg.get("duration", 2.2), work, index)


def validate_spec(spec, base):
    if not isinstance(spec, dict):
        raise ValueError("Spec must be an object")
    settings = RenderSettings.from_spec(spec)
    for name in ("backdrop", "bezel", "ink", "muted"):
        if name in spec and (not isinstance(spec[name], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", spec[name])):
            raise ValueError(f"{name} must be a #RRGGBB color")
    for name in ("titleFont", "sansFont"):
        if name in spec:
            spec[name] = str(resolve_file(base, spec[name], name))
    segments = spec.get("segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError("segments must be a nonempty array")
    inputs = {Path(spec[name]) for name in ("titleFont", "sansFont") if name in spec}
    for index, seg in enumerate(segments):
        label = f"segments[{index}]"
        if not isinstance(seg, dict) or seg.get("type") not in ("phone", "raw", "card", "end"):
            raise ValueError(f"{label}.type must be phone, raw, card, or end")
        for key in ("title", "caption", "eyebrow", "footer", "wordmark", "label"):
            if key in seg and not isinstance(seg[key], str):
                raise ValueError(f"{label}.{key} must be text")
        for key in ("image", "logo"):
            if key in seg:
                path = resolve_file(base, seg[key], f"{label}.{key}")
                inputs.add(path)
                with Image.open(path) as img:
                    img.verify()
        if "island" in seg and type(seg["island"]) is not bool:
            raise ValueError(f"{label}.island must be a boolean")
        if seg["type"] in ("phone", "raw"):
            path = resolve_file(base, seg.get("src"), f"{label}.src")
            inputs.add(path)
            _, _, duration = probe(path)
            start = number(seg.get("start", 0), f"{label}.start")
            end = number(seg.get("end", duration), f"{label}.end")
            speed = number(seg.get("speed", 1), f"{label}.speed", exclusive=True)
            if not start < end <= duration + 0.001:
                raise ValueError(f"{label}: require 0 <= start < end <= source duration ({duration:.3f}s)")
            length = (end - start) / speed
        else:
            length = number(seg.get("duration", 4 if seg["type"] == "card" else 2.2),
                            f"{label}.duration", exclusive=True)
        if length < 1 / settings.fps:
            raise ValueError(f"{label}: duration must cover at least one output frame")
    output = spec.get("output", "film.mp4")
    if not isinstance(output, str) or not output:
        raise ValueError("output must be a nonempty path")
    if (base / output).resolve() in inputs:
        raise ValueError("Output must not overwrite a source asset")
    return settings


def resolve_file(base, value, label):
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a nonempty file path")
    path = (base / value).resolve()
    if not path.is_file():
        raise ValueError(f"{label}: file not found: {path}")
    return path


def compose(spec_path):
    spec_path = Path(spec_path).resolve()
    spec, base = json.loads(spec_path.read_text()), spec_path.parent
    settings = validate_spec(spec, base)
    if (base / spec.get("output", "film.mp4")).resolve() == spec_path:
        raise ValueError("Output must not overwrite the composition spec")
    renderers = {"phone": render_phone, "raw": render_raw, "card": render_card, "end": render_end}
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        segments = [renderers[seg["type"]](spec, seg, work, i, base)
                    for i, seg in enumerate(spec["segments"])]
        listing = work / "concat.txt"
        listing.write_text("".join(f"file '{p}'\n" for p in segments))
        output = output_path(base / spec.get("output", "film.mp4"))
        run(["-f", "concat", "-safe", "0", "-i", str(listing), "-c:v", "libx264", "-crf", str(settings.crf),
             "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)])
    return output


def sheet(src, dst, frames=8, height=900):
    if type(frames) is not int or frames < 1 or type(height) is not int or height < 2:
        raise ValueError("frames must be positive and height must be at least 2")
    if Path(src).resolve() == Path(dst).resolve():
        raise ValueError("Source and output must be different files")
    _, _, duration = probe(src)
    run(["-i", str(src), "-vf", f"fps={frames}/{duration},scale=-2:{height},tile={frames}x1", "-frames:v", "1", str(output_path(dst))])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    normal = commands.add_parser("normalize", help="Make a constant-frame-rate silent copy")
    normal.add_argument("src")
    normal.add_argument("dst")
    normal.add_argument("--fps", type=int, default=30)
    composition = commands.add_parser("compose", help="Render a JSON composition")
    composition.add_argument("spec")
    contact = commands.add_parser("sheet", help="Sample frames into a contact sheet")
    contact.add_argument("src")
    contact.add_argument("dst")
    contact.add_argument("--frames", type=int, default=8)
    contact.add_argument("--height", type=int, default=900)
    args = parser.parse_args()
    try:
        if args.command == "compose":
            output = compose(args.spec)
            _, _, duration = probe(output)
            print(f"{output}  {duration:.1f}s  {output.stat().st_size / 1e6:.1f}MB")
        elif args.command == "normalize":
            normalize(args.src, args.dst, args.fps)
        else:
            sheet(args.src, args.dst, args.frames, args.height)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"film: {error}\n")


if __name__ == "__main__":
    main()
