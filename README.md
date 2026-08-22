# B站音乐下载器（桌面端）

将 B 站视频下载并转为 MP3 的跨平台桌面应用，基于 **Electron** 构建，支持 **macOS** 与 **Windows**。

> ⚠️ **合规声明**：本工具仅供个人学习 / 欣赏使用，下载行为请遵守 B 站及曲作者所在地区的版权与相关法律法规，不针对任何付费 / 加密资源。

## 功能

- 粘贴 B 站链接 / BV 号，填写歌名与类型（原唱 / 伴奏），批量加入歌单
- 自动调用 `yt-dlp`（抓取 B 站音视频，原生支持 wbi 签名）+ `ffmpeg`（转 MP3）
- 实时展示每首歌曲的下载 / 转码进度与状态（等待 / 下载中 / 转码中 / 完成 / 失败 / 已取消）
- 支持单条取消、清空已完成、选择输出目录、并发数设置
- 歌单与设置自动持久化（基于 `electron-store`）
- 下载完成后**自动抓取同名歌词 `.lrc`** 并做「曲名相似度 + 音频时长」双重校验；适配 GC200Pro 等需要带时间轴歌词的音箱（仅纯文本时按音频时长合成近似时间轴）

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Electron（主进程 Node + 渲染进程 WebView） |
| 构建 | electron-vite + TypeScript |
| 渲染 | React + Tailwind CSS（暗色玻璃拟态风格） |
| 打包 | electron-builder（macOS `.dmg` / Windows `.exe` NSIS） |
| 下载/转码 | `yt-dlp` + `ffmpeg` |

## 二进制策略

- **优先使用系统已安装的 `yt-dlp` / `ffmpeg`**（macOS 上用 `brew install yt-dlp ffmpeg` 安装后可零额外下载）。
- 若系统未安装（如未装命令行的 Windows），应用会在首次使用时自动把 `yt-dlp` 下载到用户数据目录；`ffmpeg` 使用随附的静态二进制。
- 所有调用均以参数数组形式 `spawn`，禁用 `shell: true`，避免命令注入。

## 开发运行

```bash
npm install      # 安装依赖（含 Electron，首次较慢）
npm run dev      # 启动开发模式，自动打开应用窗口
```

## 打包发布

```bash
npm run dist     # 产出安装包到 dist/ 目录
```

- macOS：生成 `dist/B站音乐下载器-*.dmg`
- Windows：生成 `dist/B站音乐下载器-*.exe`（NSIS 安装包）

> 说明：个人使用场景下 macOS 未做代码签名 / 公证（`identity: null`）。在 macOS 上首次打开未签名 dmg 时，可能需在「系统设置 → 隐私与安全性」中手动允许。如需对外发布，请配置 Apple Developer 证书。

### 打 tag 自动发布（GitHub Actions）

仓库已内置 `.github/workflows/release.yml`：**打 `v*` 标签即可触发双平台构建并自动发布到 GitHub Release**。

```bash
git tag v1.0.1
git push --tags        # 触发 CI：macOS(dmg) + Windows(exe) 构建并发布
```

- 运行矩阵：`macos-latest` 产出 `.dmg`，`windows-latest` 产出 NSIS `.exe`，两者由 electron-builder 原生发布到同一 Release。
- 发布：各平台在构建后由 `electron-builder --publish always` 直接写入 GitHub Release（基于 `package.json` 的 `build.publish` 配置 + 内置 `GITHUB_TOKEN`），无需额外发布步骤。
- 也可在 Actions 页面手动 `workflow_dispatch` 触发。
- 详情见 `docs/implementation.md` 第 6 节。

## 与原脚本的关系

仓库中原有的两个 Shell 脚本保留作为参考，未被改动：

- `download_songs_bilibili.sh`：B 站下载（基于 `you-get`），本应用已用 `yt-dlp` 取代 `you-get` 实现等效能力。
- `download_songs.sh`：YouTube 下载（基于 `yt-dlp`），本期未纳入应用范围。

## 目录结构

```
songDownload/
├── package.json / electron.vite.config.ts / tsconfig.json
├── tailwind.config.js / postcss.config.js
├── src/
│   ├── shared/types.ts          # 共享类型
│   ├── main/                     # 主进程：binaries / store / downloadManager / ipc / index
│   ├── preload/index.ts          # 安全桥（contextBridge）
│   └── renderer/                 # React 界面：App + components + styles
└── README.md
```

## 📚 文档

- [用户使用手册](docs/user-guide.md)：安装、操作步骤、歌词状态说明、GC200Pro 音箱适配与注意事项。
- [技术实现文档](docs/implementation.md)：架构、下载 / 转码、歌词匹配与校验算法、二进制策略、构建与 CI。

