# 自动发版

公开 Release 默认只附带四个安装包：Windows x64 安装器 EXE、macOS Apple Silicon／Intel 的 DMG、Linux x64 的 DEB。发布说明列出实际下载入口，并在折叠区域提供 SHA-256；ZIP、tar.gz、JSON 报告及独立校验文件保留在 Actions 工件中。GitHub 自动生成的 Source code 归档入口由平台提供，不属于上传的 Release 附件。

PR／合并阶段只运行快速代码检查与浏览器回归，不运行六平台打包或安装器测试。版本标签发版及显式手动打包继续构建 macOS、Windows、Linux × amd64／arm64 的六个目标。全部平台的代码检查、原生双次 smoke、包架构、版本、源提交和 SHA-256 验证通过后，才公开四个安装包。内部完整26项清单和报告继续由 collect 校验并保存在 Actions。

合并到 main 后，推送 `vX.Y.Z` 注释标签触发发版。标签必须指向 main 已合并提交，不能含前导零或预发布后缀：

```sh
git fetch origin
git tag -a v1.2.3 origin/main -m 'Bible v1.2.3'
git push origin v1.2.3
```

将示例替换为本次版本。新策略版本也可从 Release 工作流手动选择相同标签重跑。上传中断保留草稿以恢复；草稿重新构建会同步说明中的校验和。已公开版本按原说明中的策略／来源／校验和及 GitHub asset digest 复核，保留原安装包。旧26项公开布局仍可按其原始索引验证。缺包、篡改、源提交变化或未知附件均阻止发布。

用户明确允许自动发版使用 `github-actions[bot]` 和临时 `GITHUB_TOKEN` 的 Contents 写权限；构建作业保持只读。手工提交、推送、PR 与附件维护使用 xibolun。macOS 仍为临时签名且未公证，Windows 未签名。DMG 显式使用 HFS+ 并执行签名、完整性及原生验证。

用户显式要求精简既有版本时，先预览并保存经过完整校验的原 Release metadata、说明和索引，再执行。以下以 v0.2.0 为例，备份目录应位于仓库外：

```sh
python3 tools/release.py prune --tag v0.2.0 --backup-directory /path/to/release-backup
python3 tools/release.py prune --tag v0.2.0 --backup-directory /path/to/release-backup --apply
```

默认预览不修改 GitHub；执行只删除已核验快照里的多余附件，保留四个原安装包的 ID、大小、digest 和标签／提交。使用同一备份目录可恢复中断，重复执行不改动已完成版本。旧标签自带的旧发布工具会拒绝精简后的布局，并不会重新上传被删除的文件；不要移动旧标签以绕过这一保护。其他旧 Release 不会自动清理。

本地验证运行 `python3 -m unittest discover -s tools -p 'test_*.py'`，并用 `python3 -O -m unittest discover -s tools -p test_release.py` 复核发布安全条件。测试使用合成小文件和模拟 GitHub，不构建安装器或修改真实 Release。

实现依据：[GitHub 可复用工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)、[Release 创建](https://cli.github.com/manual/gh_release_create)、[草稿列表及访问权限](https://docs.github.com/en/rest/releases/releases#list-releases)、[资产哈希字段](https://docs.github.com/en/rest/releases/assets)。
