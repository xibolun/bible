# 自动发版

PR／合并阶段只运行快速代码检查与浏览器回归，不运行六平台打包、安装器测试或工件聚合。六平台完整流程仅由版本标签发版或显式手动运行触发；Issue 分支推送不再额外触发一套重复打包。

将本功能合并到 main 后，推送 `vX.Y.Z` 标签触发完整发版。标签必须指向已合并到 main 的提交；版本号不能含前导零或预发布后缀。

```sh
git fetch origin
git tag -a v1.2.3 origin/main -m 'Bible v1.2.3'
git push origin v1.2.3
```

将示例版本号替换为本次计划版本。也可在 GitHub Actions 的 Release 工作流中手动选择同一个现有标签重跑。

流程会构建 macOS、Windows、Linux 的 amd64 和 arm64，共六个目标，执行代码检查、浏览器回归、原生运行测试与包架构检查。所有目标成功后，再核对版本、源提交、原生/UI 版本、SHA-256 和完整清单，上传全部工件并公开 Release。任一目标失败都不会产生新的公开 Release。

每个 Release 包含 12 个安装或便携文件、六份目标清单、六份原生验证报告，以及汇总 `release-manifest.json` 与 `SHA256SUMS`。发布说明提供逐平台下载链接。macOS 仍为临时签名、Windows 未签名；此自动化不提供发布证书或公证。

上传中断时保留本工作流创建的草稿，可以重跑恢复。已公开的完整版本在重跑时核对其原有清单及哈希并保留文件，不用重新构建的时间戳差异覆盖公开资产。标签移位、缺失/错误平台包、版本或提交不一致、未通过原生验证，以及哈希错误都会阻止发布。

用户已明确允许仅自动发版使用 `github-actions[bot]`。发布作业单独使用仓库内置临时 `GITHUB_TOKEN` 的 Contents 写权限；构建作业保持只读，不需要个人 Token 或新建 Secrets。手工代码提交、推送与 PR 仍使用 xibolun。

本地检查可运行 `python3 -m unittest discover -s tools -p 'test_*.py'`。手动 desktop 打包的 collect 作业也运行完整发布包校验，但不执行公开发布；发布函数使用模拟 GitHub 测试中断、重跑及不可变资产行为。

实现依据：[GitHub 可复用工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)、[Release 创建](https://cli.github.com/manual/gh_release_create)、[草稿列表及访问权限](https://docs.github.com/en/rest/releases/releases#list-releases)、[资产哈希字段](https://docs.github.com/en/rest/releases/assets)。
