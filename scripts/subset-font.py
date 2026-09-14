#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
来信 · 手写字体子集化脚本（可复跑）。

为什么要子集化：
  - 霞鹜文楷全量 ttf 约 24 MB、清松手写体5 约 5.6 MB，直接进包太重。
  - npm 上的 @free-fonts/lxgw-wenkai 走「256 码点分块 + unicode-range」，对拉丁文有效，
    但汉字在码点空间里按部首/笔画排列、不按使用频率，一封信 300 个不同字会命中约 80 块，
    等于全量下载 —— 所以中文手写体必须用「子集化单文件」。

字符集来源（合并去重）：
  1. GB2312 一级汉字（3755 字，日常覆盖 99.5%+）
  2. 项目自身源码里出现过的所有非 ASCII 字符（贴合本项目用词）
  3. ASCII 可打印字符 + 常用中文标点

用法：
  python scripts/subset-font.py \
      --src-han   /path/JasonHandwriting5.ttf \
      --src-fallback /path/LXGWWenKai-Regular.ttf \
      --out-dir   public/fonts
"""

import argparse
import os
import sys

try:
    from fontTools import subset  # noqa: F401
except ImportError:  # pragma: no cover
    print('缺少 fonttools：请先 `pip install fonttools brotli`')
    sys.exit(1)


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_EXTS = ('.ts', '.tsx', '.js', '.jsx', '.md', '.html', '.css', '.json', '.py', '.mjs')
SKIP_DIRS = {'node_modules', '.git', 'dist', 'build', '.fontbuild', 'public'}


def gb2312_level1() -> set:
    """GB2312 一级汉字（0xB0A1–0xD7F9），共 3755 字。"""
    chars = set()
    for high in range(0xB0, 0xD8):
        for low in range(0xA1, 0xFF):
            try:
                chars.add(bytes([high, low]).decode('gb2312'))
            except UnicodeDecodeError:
                continue
    return chars


def gb2312_level2() -> set:
    """GB2312 二级汉字（0xD8A1–0xF7FE），共 3008 字。兜底字体用得上。"""
    chars = set()
    for high in range(0xD8, 0xF8):
        for low in range(0xA1, 0xFF):
            try:
                chars.add(bytes([high, low]).decode('gb2312'))
            except UnicodeDecodeError:
                continue
    return chars


def project_chars() -> set:
    """扫描项目源码，收集出现过的所有非 ASCII 字符（贴合本项目用词）。"""
    chars = set()
    for root, dirs, files in os.walk(PROJECT_ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if not name.endswith(SOURCE_EXTS):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    for ch in f.read():
                        if ord(ch) > 0x7F:
                            chars.add(ch)
            except OSError:
                continue
    return chars


def ascii_and_punct() -> set:
    """ASCII 可打印字符 + 常用中文标点/符号。"""
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars.update('　、。〈〉《》「」『』【】〔〕（）［］｛｝—…·～￥％＋－×÷＝“”‘’；：？！，．／＼｜＃＆＊')
    chars.update('①②③④⑤⑥⑦⑧⑨⑩')
    chars.update('—–…⋯※★☆✦✧❤♥')
    chars.add('\n')
    return chars


def build_charset(tier: str) -> set:
    """tier: 'primary'（打底手写体）/ 'fallback'（兜底楷体，字集更大）。"""
    base = ascii_and_punct() | gb2312_level1()
    if tier == 'fallback':
        base |= gb2312_level2()
    base |= project_chars()
    return base


def subset_font(src: str, dst: str, chars: set) -> None:
    """调用 fontTools 官方子集化入口（= pyftsubset 等价命令）。"""
    from fontTools import subset as ft_subset

    text_file = dst + '.chars.txt'
    with open(text_file, 'w', encoding='utf-8') as f:
        f.write(''.join(sorted(chars)))

    try:
        ft_subset.main([
            src,
            f'--text-file={text_file}',
            f'--output-file={dst}',
            '--flavor=woff2',
            '--layout-features=*',      # 保留全部 OpenType 特性
            '--name-IDs=*',
            '--notdef-outline',
            '--recalc-bounds',
            '--desubroutinize',
            '--drop-tables+=',          # 不额外丢表
        ])
    finally:
        try:
            os.remove(text_file)
        except OSError:
            pass

    size = os.path.getsize(dst)
    print(f'  -> {os.path.basename(dst)}  {size / 1024 / 1024:.2f} MB  ({len(chars)} chars)')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src-han', required=True, help='清松手写体5 的 ttf 路径')
    ap.add_argument('--src-fallback', help='霞鹜文楷 ttf 路径（可选，缺省则跳过）')
    ap.add_argument('--out-dir', default='public/fonts', help='输出目录（相对项目根）')
    args = ap.parse_args()

    out_dir = args.out_dir if os.path.isabs(args.out_dir) else os.path.join(PROJECT_ROOT, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)

    print('[1/2] 子集化清松手写体5（打底）…')
    subset_font(args.src_han, os.path.join(out_dir, 'JasonHandwriting5-subset.woff2'), build_charset('primary'))

    if args.src_fallback and os.path.exists(args.src_fallback):
        print('[2/2] 子集化霞鹜文楷（缺字兜底）…')
        subset_font(args.src_fallback, os.path.join(out_dir, 'LXGWWenKai-Regular-subset.woff2'), build_charset('fallback'))
    else:
        print('[2/2] 未提供霞鹜文楷源文件，跳过（缺字将回退系统楷体）')

    print('完成。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
