# 实习生笔试题：DSH 技能管理插件

## 考试规则

| 项目 | 说明 |
|---|---|
| 作答时间 | 收到题目后 24 小时 |
| 开发环境 | 使用开发时最新公开版本的 DSH 和 Skills.sh |
| 在线数据源 | 仅使用 <https://www.skills.sh/> |
| AI 工具 | 工具和模型不限，必须全程使用 AI 编程 |
| 提交物 | 公开 GitHub 仓库、可安装插件、功能演示视频 |

## 任务

开发一个符合 DSH 插件规范的技能管理插件。插件安装后，用户可以在 DSH WebUI 设置界面浏览和安装 <https://www.skills.sh/> 中的技能，并管理本机已经安装的技能。

## 必做功能

1. 按关键词搜索 Skills.sh 技能。
2. 展示技能名称、简介、来源、安装量和 Skills.sh 页面链接。
3. 安装选中的技能，并让 DSH 能够发现该技能。
4. 列出插件管理的本机技能。
5. 检查技能更新并完成更新。
6. 卸载技能。
7. 处理加载、空结果、网络失败、重复安装、更新失败和来源失效。

## 插件要求

- 可以通过 dsh plugin 命令从 GitHub 仓库安装。
- 安装后在 DSH WebUI 设置界面提供独立入口。
- 无需修改 DSH 源代码。
- 写入、更新和删除操作只能发生在 DSH 技能目录内。
- 安装覆盖、更新和卸载前须向用户确认。
- 提供构建、类型检查和测试命令。
- 自动化测试至少覆盖安装、更新、卸载和路径安全。

## 开发过程

1. 安装 [Matt Pocock Skills](https://github.com/mattpocock/skills)。
2. 建立仓库后先运行 setup-matt-pocock-skills，并选择 GitHub Issues。
3. 从 ask-matt 开始，按照它给出的流程推进开发。
4. 使用 GitHub Issues 记录任务拆解、验收条件和关键决策。
5. 所有功能通过分支和 PR 提交，每个 PR 关联对应 Issue。
6. PR 写明测试结果、使用的 AI 工具和模型、关键人工判断。

## 提交物

1. **公开 GitHub 仓库：** 包含源代码、README、测试、Issue、PR 和完整提交记录。
2. **可安装插件：** README 首页提供一条可复制执行的安装命令。
3. **功能演示视频：** 建议 3 至 6 分钟，展示插件安装、技能搜索、安装、更新检查、卸载和测试结果。

请在收到题目后的 24 小时内，将仓库链接和视频链接提交给与你对接的 HR。

## 参考资料

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH 社区插件示例](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
- [find-skills](https://www.skills.sh/vercel-labs/skills/find-skills)
- [ask-matt](https://github.com/mattpocock/skills/blob/main/skills/engineering/ask-matt/SKILL.md)
