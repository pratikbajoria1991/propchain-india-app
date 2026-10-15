"""Build the scroll-world media for PropChain India from source/*.jpg.

Reproducible: `python scripts/build-media.py`  (needs ffmpeg + Pillow)

For each scene it produces
  public/assets/<n>.webp, <n>-m.webp        posters (== first video frame)
  public/assets/vid/<n>.mp4, <n>-m.mp4      4 s zoom "dive" (1080p / 720x1280)
  public/assets/vid/conn<k>.mp4, -m.mp4     frame-locked connectors built from
                                            the dive's real last/first frames
  public/og.jpg                             1200x630 social card

Desktop uses a tight 16:9 crop (no dead black sky); mobile uses a native 9:16
crop composed around each scene's focal point, not a squashed landscape.
Encodes are deliberately aggressive (crf 27, keyframe every 4 frames for
smooth scrubbing) because the content is a slow camera move on a still.
"""
import os, subprocess, sys, shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'source')
OUT = os.path.join(ROOT, 'public', 'assets')
VID = os.path.join(OUT, 'vid')
TMP = os.path.join(ROOT, 'build')
for d in (OUT, VID, TMP):
    os.makedirs(d, exist_ok=True)

# (x, y, w, h) crop boxes in source pixels (sources are 3200 px wide).
SCENES = {
    'city':  {'desk': (60, 470, 2133, 1200), 'mob': (960, 470, 675, 1200)},
    'tower': {'desk': (0, 150, 3200, 1800),  'mob': (100, 0, 1200, 2133)},
    'stake': {'desk': (0, 100, 3200, 1800),  'mob': (1000, 0, 1169, 2078)},
}
ORDER = ['city', 'tower', 'stake']
DIVE_FRAMES = 100          # 4 s @ 25 fps
CONN_FRAMES = 60           # 2.4 s
ZOOM = 0.32                # total zoom-in over a dive
GRADE = 'eq=contrast=1.05:saturation=1.08'
ENC = ['-c:v', 'libx264', '-preset', 'slow', '-g', '4', '-pix_fmt', 'yuv420p',
       '-movflags', '+faststart', '-an']


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(' '.join(cmd), '\n', r.stderr[-1500:])
        sys.exit(1)


def ffmpeg(*args):
    run(['ffmpeg', '-y', '-loglevel', 'error', *args])


def dive(name, kind):
    size = (1920, 1080) if kind == 'desk' else (720, 1280)
    up = (size[0] * 2, size[1] * 2)
    crf = '27' if kind == 'desk' else '29'
    box = SCENES[name][kind]
    im = Image.open(os.path.join(SRC, f'{name}.jpg')).convert('RGB')
    x, y, w, h = box
    im = im.crop((x, y, x + w, y + h)).resize(up, Image.LANCZOS)
    still = os.path.join(TMP, f'{name}_{kind}.png')
    im.save(still)
    suffix = '' if kind == 'desk' else '-m'
    out = os.path.join(VID, f'{name}{suffix}.mp4')
    z = f"1+{ZOOM}*on/{DIVE_FRAMES - 1}"
    vf = (f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
          f"d={DIVE_FRAMES}:s={size[0]}x{size[1]}:fps=25,{GRADE}")
    ffmpeg('-i', still, '-vf', vf, '-frames:v', str(DIVE_FRAMES), *ENC, '-crf', crf, out)
    # poster == the clip's first frame, so the still->video swap is invisible
    first = os.path.join(TMP, f'{name}{suffix}_first.png')
    ffmpeg('-i', out, '-frames:v', '1', '-update', '1', first)
    Image.open(first).save(os.path.join(OUT, f'{name}{suffix}.webp'), quality=82, method=6)
    return out


def frame(video, which, dest):
    if which == 'last':
        ffmpeg('-sseof', '-0.1', '-i', video, '-frames:v', '1', '-update', '1', dest)
    else:
        ffmpeg('-i', video, '-frames:v', '1', '-update', '1', dest)


def connector(a, b, kind, idx):
    suffix = '' if kind == 'desk' else '-m'
    size = (1920, 1080) if kind == 'desk' else (720, 1280)
    crf = '27' if kind == 'desk' else '29'
    va = os.path.join(VID, f'{a}{suffix}.mp4')
    vb = os.path.join(VID, f'{b}{suffix}.mp4')
    fa = os.path.join(TMP, f'{a}{suffix}_last.png')
    fb = os.path.join(TMP, f'{b}{suffix}_first2.png')
    frame(va, 'last', fa)
    frame(vb, 'first', fb)
    n = CONN_FRAMES
    half = n // 2
    sw, sh = size[0] * 2, size[1] * 2
    fc = (f"[0:v]scale={sw}:{sh},zoompan=z='1.0+0.12*on/{n-1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={size[0]}x{size[1]}:fps=25[a];"
          f"[1:v]scale={sw}:{sh},zoompan=z='1.05-0.05*on/{n-1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={size[0]}x{size[1]}:fps=25[b];"
          f"[a][b]xfade=transition=fade:duration=0.8:offset={half / 25 - 0.4:.2f}")
    out = os.path.join(VID, f'conn{idx}{suffix}.mp4')
    ffmpeg('-i', fa, '-i', fb, '-filter_complex', fc, '-frames:v', str(n), *ENC, '-crf', crf, out)


def og():
    x, y, w, h = SCENES['city']['desk']
    im = Image.open(os.path.join(SRC, 'city.jpg')).convert('RGB').crop((x, y, x + w, y + h))
    tw = 1200
    th = 630
    r = im.resize((tw, int(im.height * tw / im.width)), Image.LANCZOS)
    top = (r.height - th) // 2
    r.crop((0, top, tw, top + th)).save(os.path.join(ROOT, 'public', 'og.jpg'), quality=84, optimize=True)


if __name__ == '__main__':
    for kind in ('desk', 'mob'):
        for n in ORDER:
            print('dive', n, kind, flush=True)
            dive(n, kind)
        for i in range(len(ORDER) - 1):
            print('connector', ORDER[i], '->', ORDER[i + 1], kind, flush=True)
            connector(ORDER[i], ORDER[i + 1], kind, i + 1)
    og()
    shutil.rmtree(TMP, ignore_errors=True)
    print('DONE')
