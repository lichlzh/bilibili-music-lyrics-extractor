#!/bin/zsh
# ============================================================
# 歌曲下载脚本（基于 yt-dlp）
# 用途：从 YouTube 拉取你列出的 10 首歌的原唱音频
# ⚠️ 版权与合规提示：
#    - 仅用于个人学习/欣赏，且请确保你拥有相应下载权利
#    - 下载行为需遵守 YouTube 及曲作者所在地区的相关法律法规
#    - 本脚本不针对任何付费平台的加密资源
# ============================================================

# 0. 前置依赖（只需装一次）
#    brew install yt-dlp ffmpeg
#    若已安装可跳过

# 1. 下载目录
OUT_DIR="/Users/lz/Downloads/songs"
mkdir -p "$OUT_DIR"

# 2. 歌曲列表（"歌名 歌手/原唱" 帮助 yt-dlp 精确匹配）
songs=(
  "珊瑚颂 原唱"
  "山风山风等等我"
  "烟雨唱扬州 李殊"
  "岁月如笔写春秋"
  "女人花 梅艳芳"
  "萍聚 李翊君"
  "梅花泪 刘珂矣"
  "又见炊烟 邓丽君"
  "如水年华"
  "英雄赞歌 原唱"
)

# 3. 逐首下载（搜第一个结果，提取最佳音频为 mp3）
for q in "${songs[@]}"; do
  echo "==== 正在下载：$q ===="
  yt-dlp -f bestaudio --extract-audio --audio-format mp3 \
    --audio-quality 0 \
    --output "$OUT_DIR/%(title)s.%(ext)s" \
    "ytsearch1:$q"
done

echo "✅ 完成，文件在：$OUT_DIR"
