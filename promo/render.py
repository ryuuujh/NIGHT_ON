# -*- coding: utf-8 -*-
"""
NIGHT ON 30초 홍보영상 렌더러
- 입력: ../images 의 PNG (사이트 자산을 그대로 읽기만 한다)
- 처리: numpy/PIL로 프레임 합성(부드러운 확대·이동, 낮→밤 마스크 전환, 자막)
- 출력: ffmpeg(imageio-ffmpeg 내장 바이너리)로 H.264 MP4

사용:
  python render.py --preview            # 낮→밤 핵심 장면 미리보기(8초)
  python render.py                      # 전체 30초 (3단계에서 완성)
"""
import argparse
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
IMAGES = os.path.join(HERE, '..', 'images')
OUT_DIR = HERE

W, H, FPS = 1920, 1080, 30

NAVY = (16, 24, 45)
LAVENDER = (192, 174, 255)
WARM = (246, 244, 240)
MUTED = (184, 192, 210)

FONT_PATH = r'C:\Windows\Fonts\NotoSansKR-VF.ttf'
FONT_FALLBACK = r'C:\Windows\Fonts\malgunbd.ttf'


# ----------------------------------------------------------------------------
# 유틸
# ----------------------------------------------------------------------------
def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def smoothstep(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_in_out(x):
    x = clamp01(x)
    return 0.5 - 0.5 * math.cos(math.pi * x)


def ramp(t, t0, t1):
    """t0..t1 구간에서 0→1"""
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    return clamp01((t - t0) / (t1 - t0))


def fade_in_out(t, start, end, fade_in=0.6, fade_out=0.6):
    """start..end 동안 보이되 양 끝을 부드럽게"""
    if t < start or t > end:
        return 0.0
    a = ramp(t, start, start + fade_in)
    b = 1.0 - ramp(t, end - fade_out, end)
    return smoothstep(min(a, b))


_font_cache = {}


def font(size, weight=500):
    key = (size, weight)
    if key in _font_cache:
        return _font_cache[key]
    try:
        f = ImageFont.truetype(FONT_PATH, size)
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    except Exception:
        f = ImageFont.truetype(FONT_FALLBACK, size)
    _font_cache[key] = f
    return f


def load_image(name):
    return Image.open(os.path.join(IMAGES, name)).convert('RGB')


# ----------------------------------------------------------------------------
# 카메라: 원본에서 잘라 1920x1080으로 (부드러운 확대·이동)
# ----------------------------------------------------------------------------
def crop_box(src_w, src_h, zoom, cx, cy):
    """zoom=1 이면 16:9 커버 크롭 전체. cx,cy 는 0..1 비율 중심."""
    base_scale = max(W / src_w, H / src_h)         # 커버
    view_w = W / (base_scale * zoom)
    view_h = H / (base_scale * zoom)
    x0 = cx * src_w - view_w / 2
    y0 = cy * src_h - view_h / 2
    x0 = min(max(x0, 0), src_w - view_w)
    y0 = min(max(y0, 0), src_h - view_h)
    return (x0, y0, x0 + view_w, y0 + view_h)


def camera(img, zoom, cx, cy):
    box = crop_box(img.width, img.height, zoom, cx, cy)
    return img.resize((W, H), resample=Image.LANCZOS, box=box)


# ----------------------------------------------------------------------------
# 낮→밤 전환: 전등 아래에서 바깥으로 번지는 부드러운 어둠 (원본 좌표에서 합성)
# ----------------------------------------------------------------------------
class DayNightBlender:
    def __init__(self, day_img, night_img, center=(902, 300), axes=(1.0, 1.15), feather=0.45):
        self.day = np.asarray(day_img).astype(np.float32)
        self.night = np.asarray(night_img).astype(np.float32)
        h, w = self.day.shape[:2]
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
        cx, cy = center
        ax, ay = axes
        # 화면 대각선 기준으로 정규화한 타원 거리(0=전등, ~1=가장 먼 모서리)
        diag = math.hypot(w, h)
        self.dist = np.sqrt(((xs - cx) / ax) ** 2 + ((ys - cy) / ay) ** 2) / diag
        self.dmax = float(self.dist.max())
        self.feather = feather
        self.size = (w, h)

    def frame(self, progress):
        """progress 0 → 완전한 낮, 1 → 완전한 밤"""
        if progress <= 0:
            return Image.fromarray(self.day.astype(np.uint8))
        if progress >= 1:
            return Image.fromarray(self.night.astype(np.uint8))
        # 반경이 0에서 (dmax + feather)까지 자라난다
        radius = progress * (self.dmax + self.feather)
        m = (radius - self.dist) / self.feather
        m = np.clip(m, 0, 1)
        m = m * m * (3 - 2 * m)                       # 가장자리를 부드럽게
        m = m[:, :, None]
        out = self.day * (1 - m) + self.night * m
        return Image.fromarray(out.astype(np.uint8))


# ----------------------------------------------------------------------------
# 자막·타이포
# ----------------------------------------------------------------------------
def draw_caption(frame, text, alpha, size=54, weight=500, y=955, color=WARM,
                 letter_spacing=0, shadow=True, align='center', x=None, backing=False):
    """프레임 위에 자막을 알파 블렌딩으로 얹는다."""
    if alpha <= 0.001:
        return frame
    f = font(size, weight)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # 글자 간격 처리
    if letter_spacing:
        widths = [d.textlength(ch, font=f) for ch in text]
        total = sum(widths) + letter_spacing * (len(text) - 1)
    else:
        total = d.textlength(text, font=f)
    if x is None:
        x0 = (W - total) / 2 if align == 'center' else 120 if align == 'left' else W - 120 - total
    else:
        x0 = x
    if backing:
        pad_x, pad_y = 28, 14
        bb = d.textbbox((0, 0), text, font=f)
        d.rounded_rectangle((x0 - pad_x, y + bb[1] - pad_y, x0 + total + pad_x, y + bb[3] + pad_y),
                            radius=6, fill=(16, 24, 45, int(150 * alpha)))
    if shadow:
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        _draw_text(sd, x0, y, text, f, (0, 0, 0, int(170 * alpha)), letter_spacing)
        sh = sh.filter(ImageFilter.GaussianBlur(6))
        layer = Image.alpha_composite(layer, sh)
        d = ImageDraw.Draw(layer)
    _draw_text(d, x0, y, text, f, color + (int(255 * alpha),), letter_spacing)
    base = frame.convert('RGBA')
    return Image.alpha_composite(base, layer).convert('RGB')


def _draw_text(d, x, y, text, f, fill, letter_spacing):
    if not letter_spacing:
        d.text((x, y), text, font=f, fill=fill)
        return
    cx = x
    for ch in text:
        d.text((cx, y), ch, font=f, fill=fill)
        cx += d.textlength(ch, font=f) + letter_spacing


def fade_to_black(frame, amount):
    if amount <= 0:
        return frame
    arr = np.asarray(frame).astype(np.float32) * (1 - amount)
    return Image.fromarray(arr.astype(np.uint8))


# ----------------------------------------------------------------------------
# 장면: 낮→밤 핵심 장면 (미리보기 = 전체 영상의 5~13초 구간과 동일한 연출)
# ----------------------------------------------------------------------------
def scene_day_to_night(t, dur, blender, caption=True):
    """
    t: 장면 내부 시간(초). dur: 장면 길이.
    0.0~1.5  밝은 낮 유지 (카메라만 아주 천천히 들어감)
    1.5~5.5  전등 아래에서 어둠이 넓고 부드럽게 번짐
    5.5~끝   밤 유지
    """
    p = ease_in_out(ramp(t, 1.5, 5.5))
    img = blender.frame(p)
    zoom = 1.0 + 0.06 * ease_in_out(t / dur)          # 1.00 → 1.06
    cx = 0.54 - 0.01 * ease_in_out(t / dur)           # 아주 느린 좌측 이동
    cy = 0.47
    frame = camera(img, zoom, cx, cy)
    if caption:
        a = fade_in_out(t, 2.6, dur - 0.4, fade_in=0.7, fade_out=0.6)
        frame = draw_caption(frame, '전등을 켰더니, 밤이 되었다.', a, size=56, weight=500, y=950)
    return frame


# ----------------------------------------------------------------------------
# 인코딩
# ----------------------------------------------------------------------------
def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def encode(frames_iter, out_path, total_frames, audio_path=None):
    cmd = [ffmpeg_exe(), '-y', '-hide_banner', '-loglevel', 'error',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
    if audio_path:
        cmd += ['-i', audio_path]
    cmd += ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
            '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart']
    if audio_path:
        cmd += ['-c:a', 'aac', '-b:a', '192k', '-shortest']
    cmd += [out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = 0
    for frame in frames_iter:
        proc.stdin.write(frame.tobytes())
        n += 1
        if n % FPS == 0:
            print(f'  {n}/{total_frames} frames ({n / FPS:.0f}s)', flush=True)
    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        raise SystemExit('ffmpeg failed')
    print('written:', out_path)


def render_preview(out_path):
    dur = 8.0
    total = int(dur * FPS)
    blender = DayNightBlender(load_image('hero_day.png'), load_image('hero_night.png'))

    def frames():
        for i in range(total):
            t = i / FPS
            yield scene_day_to_night(t, dur, blender)

    encode(frames(), out_path, total)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true', help='낮→밤 핵심 장면 8초 미리보기')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()
    if args.preview:
        render_preview(args.out or os.path.join(OUT_DIR, 'preview_day_to_night.mp4'))
    else:
        print('전체 30초 렌더링은 미리보기 확인 후 추가됩니다.')
        sys.exit(1)


if __name__ == '__main__':
    main()
