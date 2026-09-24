"""WCAG 對比計算。用法：python tests/contrast.py  （修改 base.css 配色後同步更新 PAIRS 與 docs/ACCESSIBILITY.md §8）"""
import sys

PAIRS = [
    ("正文", "#1a1a1a", "#ffffff", 4.5),
    ("次要文字", "#4a4a4a", "#ffffff", 4.5),
    ("連結、主色文字", "#0a4a8f", "#ffffff", 4.5),
    ("主要按鈕", "#ffffff", "#0a4a8f", 4.5),
    ("按鈕框線、輸入框", "#5c5c5c", "#ffffff", 3.0),
    ("錯誤訊息", "#a3161a", "#ffffff", 4.5),
    ("成功訊息", "#1d5a2c", "#ffffff", 4.5),
    ("很不熟", "#8b1a1a", "#fdecec", 4.5),
    ("還要再練", "#6b4200", "#fff4d6", 4.5),
    ("大致可以", "#1d5a2c", "#e7f4ea", 4.5),
    ("可以上場", "#0a4a8f", "#e8f0fb", 4.5),
    ("尚未練過", "#3d3d3d", "#eeeeee", 4.5),
    ("焦點黑框對白底", "#000000", "#ffffff", 3.0),
    ("焦點黃環對黑框", "#ffd400", "#000000", 3.0),
]


def luminance(hex_color):
    h = hex_color.lstrip("#")
    channels = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    channels = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def ratio(fg, bg):
    hi, lo = sorted([luminance(fg), luminance(bg)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    failed = False
    for name, fg, bg, minimum in PAIRS:
        r = ratio(fg, bg)
        ok = r >= minimum
        failed |= not ok
        print(f"{'OK  ' if ok else 'FAIL'} {name}: {fg} / {bg} = {r:.1f}:1 (需 {minimum}:1)")
    sys.exit(1 if failed else 0)
