<img src="frontend/public/bible.svg" width="72" alt="Bible 图标">

# Bible · 圣经

离线圣经桌面阅读器，支持 macOS、Windows 和 Linux。阅读、搜索、高亮、复制、经文卡片与第二屏投影，在本机完成。

**[下载 v0.3.0](https://github.com/xibolun/bible/releases/tag/v0.3.0)** · [全部版本](https://github.com/xibolun/bible/releases) · [使用与开发文档](docs/development.md)

## 安装

根据系统和处理器选择安装包。公开附件只提供以下四种组合；校验和见对应版本的发布说明。

| 系统       | 处理器          | 安装包                                                                                                           |
| ---------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| macOS 12+  | Apple Silicon   | [arm64 DMG](https://github.com/xibolun/bible/releases/download/v0.3.0/bible-v0.3.0-darwin-arm64.dmg)             |
| macOS 12+  | Intel           | [x64 DMG](https://github.com/xibolun/bible/releases/download/v0.3.0/bible-v0.3.0-darwin-amd64.dmg)               |
| Windows 11 | Intel / AMD x64 | [EXE 安装器](https://github.com/xibolun/bible/releases/download/v0.3.0/bible-v0.3.0-windows-amd64-installer.exe) |
| Linux      | Intel / AMD x64 | [DEB 安装包](https://github.com/xibolun/bible/releases/download/v0.3.0/bible-v0.3.0-linux-amd64.deb)             |

- **macOS**：打开 DMG，将 Bible 拖入 Applications。当前为临时签名，尚未公证。
- **Windows**：运行安装器，需要 Microsoft WebView2 Runtime。当前安装包未签名。
- **Linux**：推荐 Ubuntu 24.04+ 或兼容系统。安装 DEB 后，从应用菜单打开 Bible，或运行 `bible`。GTK4、WebKitGTK 6.0 等依赖由包管理器按声明安装。

Linux 安装示例：

```sh
sudo apt install ./bible-v0.3.0-linux-amd64.deb
```

升级及卸载保留本机设置与高亮。便携包、其他架构、JSON 构建清单和验证报告保留在 Actions 工件中。

## 添加译本

**仅内置完整中文和合本简体字（CUV）**，首次启动即可离线阅读。

1. 打开「设置 → 译本管理」，默认只展示本机译本。
2. 点击列表下方「更多译本」，才会读取 CrossWire 官方中英文目录。
3. 点击「下载」，在行内查看进度、取消或重试；校验完成后自动导入，点击「阅读」切换译本。

已安装译本的启用开关独立成列。有可比较的新版本时显示「更新」，保留原译本、启用状态和可恢复的旧版正文；版权、检查报告和版次可展开查看。两个兼容译本安装并启用后，可使用上下对照。

已有译本文件可通过「导入译本文件」识别、预览并确认安装。支持 MyBible、MySword、theWord、OSIS、Zefania XML、SWORD ZIP 的明确子集，以及受支持的 GZIP 下载；不按扩展名承诺整个平台兼容。安装后不再依赖源文件。

[查看格式、更新、恢复与删除说明](docs/edition-import.md)。请使用获准使用的文件；本地导入或官方源下载不额外授予复制、投影或再分发许可。NIV、吕振中等尚未取得分发授权的译本不内置，也不提供机器翻译替代版。

## 阅读、搜索与复制

- 点击书卷和章号阅读；左右方向键跨章、跨书卷切换，长按连续翻章。
- 单击经文选择整节，Shift 连选；拖动选择部分文字。选区工具栏提供高亮、复制和卡片导出。
- 离线搜索支持 LIKE 风格的 `%` 和 `_` 通配符。例如 `起%神` 可找到创世记 1:1；`\%` 和 `\_` 查找符号本身。
- 点击搜索结果定位并短暂高亮关键字，列表保持打开；点击正文收起搜索栏。最近 20 条搜索按译本保存。
- 设置提供四种柔和阅读主题、全局与阅读字号、中英文界面，以及七种复制样式。中文数字章号直接连接节号（约三16），阿拉伯数字保留冒号（约3:16）；出处括号支持【】、「」、[] 或无。
- 经文卡片支持方图、竖图、配色及 PNG 导出，导出尺寸和字号独立设置。

「原文字典」提供信望爱 CBOL 中文释义、希伯来文／希腊文字形、音译及 Strong’s H/G 编号查询。中文释义保留来源繁体字；经节词组来自 KJV Strong’s 标注，不代表与其他译本逐词对齐。

## 第二屏投影

按 **F8** 打开控制窗口，将独立投影窗口拖到第二屏。

- 快速录入支持中文、英文和拼音书卷名，例如 `John`、`yuehan`、`yhfy`。按 Tab 依次进入章、起始节和可选截止节；聚焦时全选已有值，便于覆盖。
- 起始节按 Enter 投放单节；按 Tab 填写截止节后 Enter 投放范围。起始节留空可投放整章。
- 点击「＋」或按 Ctrl / ⌘ + Enter 加入准备清单，可组合不同卷章的多段经文；调整后点击「投放清单」才更新观众画面。
- 可选六种投影主题，调整字号、颜色、对齐、分页及出处样式；长经文自动缩小适应画面。
- 投影窗口支持 F11 全屏、Esc 退出全屏、左右箭头或 PageUp / PageDown 翻页、B 黑屏／恢复。

单个范围限同章；清单最多 12 段、600 节。无效或缺节范围会保留当前观众画面。[完整投影操作与边界](docs/development.md)

## 快捷键

macOS 使用 ⌘，Windows / Linux 使用 Ctrl；输入框保留标准编辑操作。

| 操作             | 快捷键           |
| ---------------- | ---------------- |
| 打开设置         | Ctrl / ⌘ + ,     |
| 搜索经文         | Ctrl / ⌘ + F     |
| 复制选中经文     | Ctrl / ⌘ + C     |
| 粘贴至输入框     | Ctrl / ⌘ + V     |
| 保存偏好并退出   | Ctrl / ⌘ + Q     |
| 翻章             | ← / →，支持长按  |
| 打开投影控制     | F8               |
| 经文加入投影清单 | Ctrl / ⌘ + Enter |

## 数据与开发

经文、用户导入译本、设置和高亮保存在本机。源码预览使用明确标注的 Mock；完整格式解析、原生文件选择与持久化以桌面应用为准。

[开发与本机构建](docs/development.md) · [发布流程](docs/releases.md) · [经文来源](docs/scripture-sources.md) · [译本授权目录](docs/scripture-licensing.md) · [第三方声明](THIRD_PARTY_NOTICES.txt)
