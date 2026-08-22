// 仅在 macOS 上运行：移除 Electron 二进制的 quarantine 属性并做本地 ad-hoc 签名，
// 避免被 Gatekeeper / XProtect 判为“来路不明”而隔离或删除。
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

if (process.platform !== 'darwin') process.exit(0)

const app = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app')
if (!fs.existsSync(app)) {
  console.log('[fix-electron] 未找到 Electron.app，跳过（可能尚未下载完成）')
  process.exit(0)
}

try {
  execSync(`xattr -dr com.apple.quarantine "${app}"`, { stdio: 'ignore' })
  execSync(`codesign --force --deep --sign - "${app}"`, { stdio: 'inherit' })
  console.log('[fix-electron] 已移除 quarantine 并完成本地签名，macOS 不会再自动删除。')
} catch (e) {
  console.warn('[fix-electron] 处理失败（可忽略，或手动执行）：', e.message)
}
