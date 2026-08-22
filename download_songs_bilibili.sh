#!/bin/zsh
# ============================================================
# 从 Bilibili 下载歌曲（基于 you-get），按「歌曲名-原唱 / 歌曲名-伴奏」命名
# 目标目录：/Users/lz/Downloads/songs
# ⚠️ 合规提示：仅供个人学习/欣赏，且确保你拥有相应下载权利；
#    本脚本仅做公开视频的音频提取，不针对任何付费/加密资源。
# ============================================================

OUT_DIR="/Users/lz/Downloads/songs"
mkdir -p "$OUT_DIR"

# 每行一条： "歌曲名|类型(原唱/伴奏)|BV号"
# 类型仅用于生成最终文件名，不影响下载内容
songs=(
  # "歌曲名|原唱|BVxxxx"
  # "歌曲名|伴奏|BVxxxx"
)

for entry in "${songs[@]}"; do
  name="${entry%%|*}"
  rest="${entry#*|}"
  type="${rest%%|*}"
  bv="${rest#*|}"

  if [[ -z "$bv" ]]; then
    echo "⚠️  跳过「$name」：尚未填写 BV 号"
    continue
  fi

  out_name="$name-$type"
  tmp_mp4="$OUT_DIR/$out_name.mp4"
  final_mp3="$OUT_DIR/$out_name.mp3"

  echo "==== 正在下载：$out_name ===="
  you-get --format=dash-flv360-AVC -o "$OUT_DIR" -O "$out_name" \
    "https://www.bilibili.com/video/$bv" 2>&1 | grep -E "title:|Error|Downloading" | head -3

  # 转成 mp3 纯音频
  if [[ -f "$tmp_mp4" ]]; then
    ffmpeg -y -i "$tmp_mp4" -vn -acodec libmp3lame -q:a 2 "$final_mp3" 2>&1 | tail -1
    rm -f "$tmp_mp4" "$OUT_DIR/$out_name.cmt.xml"
    echo "✅ 已保存：$final_mp3"
  else
    echo "❌ 下载失败：$out_name（请检查 BV 号）"
  fi
done

echo "✅ 完成，文件在：$OUT_DIR"
