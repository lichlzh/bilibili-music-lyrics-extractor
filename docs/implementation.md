# 技术实现文档

## 1. 总体架构

基于 **Electron** 的跨平台桌面应用，采用标准的三层进程模型：

| 进程 | 职责 | 技术 |
|---|---|---|
| 主进程（Main） | 下载 / 转码 / 歌词检索 / 文件写入 / 系统二进制管理 | Node.js（TypeScript） |
| 预加载（Preload） | 通过 `contextBridge` 暴露安全 API 给渲染进程 | `contextIsolation` 开启，`nodeIntegration` 关闭 |
| 渲染进程（Renderer） | React 界面、歌单与设置交互 | React + Tailwind CSS |

构建由 **electron-vite** 统一处理（主 / 预加载 / 渲染三类产物），打包由 **electron-builder** 完成（macOS `.dmg`、Windows `.exe` NSIS）。

```
src/
├── shared/types.ts        # 主 / 渲染进程共享类型（SongItem / LyricsInfo / Settings 等）
├── main/
│   ├── index.ts          # 主进程入口：窗口创建、加载(dev server / 打包产物)
│   ├── binaries.ts       # yt-dlp / ffmpeg / ffprobe 路径解析与运行时下载
│   ├── store.ts          # electron-store 持久化
│   ├── downloadManager.ts# 下载 / 转码编排与并发控制
│   ├── ipc.ts            # 主 ↔ 渲染 IPC 通道
│   └── lyrics.ts         # 歌词检索、匹配、校验、近似时间轴合成
├── preload/index.ts      # 安全桥
└── renderer/             # React 界面（App + components + styles）
```

---

## 2. 下载与转码流程

1. 渲染进程通过 IPC 提交歌曲（BV / 链接、歌名、类型）。
2. 主进程 `downloadManager` 调用 `yt-dlp` 抓取 B 站音视频（原生支持 wbi 签名），再用 `ffmpeg` 转码为 MP3。
3. 进度（百分比 / 状态 / 消息）通过 IPC 实时推送回渲染进程，驱动进度条与状态徽标。
4. 下载成功后，自动触发歌词检索（见第 4 节）。
5. 所有子进程调用均以**参数数组**形式 `spawn`，禁用 `shell: true`，避免命令注入。

---

## 3. 二进制策略（`src/main/binaries.ts`）

- **系统优先**：启动时探测系统 `PATH` 中是否已存在 `ffmpeg` / `ffprobe` / `yt-dlp`，有则直接使用。
- **yt-dlp 运行时下载**：若系统未安装，`YtDlpWrap.downloadFromGithub()` 在首次使用时按当前平台把 `yt-dlp`（Windows 下为 `yt-dlp.exe`）下载到 `userData/bin` 并缓存。
- **ffmpeg 捆绑**：通过 `@ffmpeg-installer/ffmpeg` 随包附带静态二进制；该二进制**平台相关**，因此 Windows 包必须在 Windows 环境构建（见第 6 节）。

---

## 4. 歌词子系统（`src/main/lyrics.ts`）

### 4.1 数据源
- **LRCLIB**（`https://lrclib.net`）：公开、免鉴权的主歌词源，覆盖广。
- **网易云**：`/api/song/lyric` 作为最佳补充（中文覆盖好且常带真实同步时间轴）。该接口当前存在风控（返回 `code: -462`），失败时**静默跳过**，不影响主流程。

### 4.2 检索与匹配
- `cleanQuery`：去除「伴奏 / instrumental」等字样，让歌词检索命中原曲。
- `normalize`：仅保留字母、数字与中日韩文字，去除标点与空格，用于相似度比较。
- **Dice 系数**（基于二元组 bigram）计算曲名 / 「曲名+歌手」与查询的相似度，适合中短字符串。
- **候选评分**：`score = 曲名相似度 × 0.75 + 时长一致性 × 0.25`，时长一致性由 `|音频时长 − 曲库时长|` 映射。
- **关键防错（NAME_MIN = 0.5）**：只有曲名相似度达标的候选才进入「合格池」；「优先选带时间轴」只在**合格池内部**生效。这样可避免「检索返回的错误歌曲恰好带时间轴」反被选中、覆盖正确纯文本的问题（例如《歌唱祖国》的检索首位曾是喜羊羊歌词）。

### 4.3 校验
- 曲名相似度 + 音频时长一致性双重校验（音频时长优先用 `ffprobe`，回退到 `yt-dlp` 元数据）。
- 若**没有任何候选通过曲名相似度门槛** → 返回 `mismatch`，**绝不写入文件**，从机制上杜绝张冠李戴。

### 4.4 近似时间轴合成
- 当歌词源仅提供纯文本、但可获得音频真实时长时，按 `总时长 / 行数` 把每行均匀铺开，生成标准 `[mm:ss.xx]` 格式的 LRC。
- 内容仍是正确歌词，仅时间戳为近似（不与演唱逐字对齐），目的是让需要时间轴的音箱也能滚动显示。
- 若连音频时长都未知，则只保存纯文本（`歌词(纯)`）。

### 4.5 输出
- 写入与 MP3 **同目录、同名**的 `.lrc`（UTF-8），原唱与伴奏各自一份。
- 返回 `LyricsInfo`：`status`（downloaded / mismatch / notfound）、`note`（校验说明）、`synced`（是否含时间轴）。

---

## 5. 跨平台与构建

- macOS 打包：`electron-builder` 生成 `.dmg`，`identity: null`（个人使用，未公证）。
- Windows 打包：`electron-builder` 生成 NSIS `.exe`，同样未签名。
- **为何 Windows 构建需在 Windows 上做**：
  1. `ffmpeg` 静态二进制平台相关，`@ffmpeg-installer/ffmpeg` 按构建机系统拉取对应二进制；在 macOS 上打包会带入 macOS 二进制，Windows 无法运行；
  2. NSIS 安装器工具链在 Windows 上最可靠。

---

## 6. 持续集成（GitHub Actions）

文件：`.github/workflows/build-windows.yml`

- 触发：`push` 到 `main` / `master`，或手动 `workflow_dispatch`。
- 运行环境：`windows-latest`。
- 步骤：
  1. `actions/checkout@v4` 检出代码；
  2. `actions/setup-node@v4`（Node 20，启用 npm 缓存）；
  3. `npm ci`（依据 `package-lock.json` 精确安装，Windows 上会拉到正确的 ffmpeg 二进制）；
  4. `npm run dist`（`electron-vite build` + `electron-builder`，在 Windows runner 上只构建 win 目标）；
  5. `actions/upload-artifact@v4` 上传整个 `dist/`（含 `Setup.exe`）供下载。
- 未使用发布（Publish），不依赖 `GH_TOKEN`；产物以 Artifact 形式提供，个人使用足够。

---

## 7. 已知限制

- 网易云接口被风控时，部分歌曲拿不到**真实逐字同步**歌词；老歌 / 冷门歌在 LRCLIB 往往只有纯文本 → 退化为近似时间轴。
- 近似时间轴不与演唱逐字对齐，仅保证可滚动显示。
- 歌词匹配以曲名 + 时长为依据，极端情况下仍可能漏匹配或误匹配（误匹配会被 `mismatch` 拦截且不写文件）。如对准确性要求极高，可点击歌词徽标打开 `.lrc` 人工核对。
