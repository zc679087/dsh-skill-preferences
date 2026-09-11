# dsh-skill-preferences

从用户设置中开启或关闭单个 [DSH](https://github.com/deepseek-ai/deepseek-harness) 技能。

以普通 Cordis 插件形式安装。**它不修改任何 DSH 源文件** —— 没有打补丁的注册表，没有 fork 的包，也不需要重新构建宿主。

## 安装

将其安装到你希望使用的 DSH profile 中 —— `$DSH_HOME/profiles/<profile>/`，切勿安装到 DSH 源码树中：

```sh
cd "$DSH_HOME/profiles/headless"   # 或 web、tui 等
pnpm add dsh-skill-preferences
```

然后在该 profile 自己的用户补丁层 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 中添加一行：

```yaml
- insert:
    - id: skill-preferences
      name: 'dsh-skill-preferences'
```

该文件会在每个 bundle 层之后应用，因此 DSH 安装目录中的任何内容都不会被改动。

### 在 agent preset 内发现技能的组合方式

上面这一行控制注册表的**全局**层。某个组合可能会禁用宿主的
`skill-filesystem` 行，让每个 agent preset 自行发现其技能 —— Web bundle 正是
这么做的。更近的作用域层会完全替换全局层中同名条目，所以在那种结构下，
单独的全局行什么也抑制不了，设置页也没有内容可列。

在 preset 的 `agent.cordis.yml` 中 `skill-filesystem` 挂载的地方加上 preset 这一半：

```yaml
- id: skill-preferences-preset
  name: 'dsh-skill-preferences/preset'
```

它不持有任何设置 —— 宿主行发布它读取的策略服务，注册它同时也
告诉设置界面该读取哪些作用域，于是页面会列出这些 agent 所看到的目录。

重启宿主。

要移除该功能，删除该行并卸载包即可；已存储的设置区段会原样保留，只是不再被读取。

## 设置

```yaml
skill-preferences:
  disabled:
    - pdf
    - nature-figure
  hints:
    pdf:
      description: "Use this skill whenever the user wants to do anything with PDF files..."
      source: bundled
```

`disabled` 是唯一的权威来源。`hints` 是在某个技能被关闭时捕获的展示元数据，这样即使设置页已经无法再读取某个技能，也能渲染出一条真实的行；删除整个 `hints` 区段只会降低展示效果。

## 远程 API

该插件为设置 UI 发布自己的 RPC face。Typert Gateway 通过反射从运行中的
服务声明它，因此不涉及生成的宿主构件，也不需要改动 DSH API 网关：

| 端点 | 参数 | 返回 |
|---|---|---|
| `skillPreferences/list` | `{ query: { cwd?: string } }` | 每个技能及其偏好状态 |
| `skillPreferences/setEnabled` | `{ change: { name, enabled, cwd? } }` | 提交变更后的表 |

该 face 仅在存在设置服务时才存在，因为它要写入设置。没有 API 网关的组合
（headless、ACP）挂载它是无害的，也永远不会分发到它。

在这里读取目录，而不是通过 DSH 自身的 `skill.list` RPC，是刻意为之：那个
RPC 需要会话 id，并且已经过滤为用户可调用的技能，因此它永远无法向
设置页展示它存在的意义就是要编辑的那些行。

`cwd` 是可选的，用于选择项目级发现；省略时读取全局目录。

## 禁用是如何生效的

被禁用的技能**不会**在某个消费者处被过滤掉。在单个消费者处过滤可以被任何其他
`ctx.skills.get()` 的调用方绕过，因此那不构成强制措施。

该插件转而注册一个普通的技能提供者，它在 rank `0` 处为每个被禁用的名称
贡献一个候选条目 —— 位于每个打包源（从 100 开始）之前 —— 并携带
`invocation: { modelInvocable: false, userInvocable: false }`。注册表把名称解析到该
条目，因此 `list()`、`snapshot()` 和 `get()` 全都一致，每个消费者也通过它
已经在检查的调用策略来拒绝该技能：

| 界面 | 结果 |
|---|---|
| 面向模型的技能目录 | 该技能不存在 |
| `skill` 工具加载 | 作为不可模型调用而被拒绝 |
| `/<skill-name>` 用户手势 | 不注入；保持为纯文本 |
| Web `/` 技能弹窗 | 该技能不存在 |

提交的设置变更会使目录失效并发出 `skills/change`，因此无需重启任何东西。

## Web UI

同一个包承载了浏览器那一半。`dsh.client` 加上 `exports["./client"]` 正是
宿主的 client-module 扫描器要找的东西，并且它在运行时从 profile 自己的
`node_modules` 解析插件包 —— 因此上面那一行 `cordis.patch.yml` 同时安装了两半，
而 DSH 永不被重新构建。

该标签页位于 **Settings → Plugins → Skills**。每一行显示技能名称、描述、
来源，以及它已解析的模型/用户调用状态，每个技能各有一个开关，还有一个搜索框。
写入失败时会从宿主重新读取，而不是保留本地的猜测值。

Remote 命名空间由该插件从其手写的 Typert 贡献
（`src/remote.ts`）挂载，而非来自 `@deepseek-ai/dsh-api-remotes` 的挂载列表 ——
那张列表只是那个 assembly 自己的选择，并不是唯一的入口。命名空间和标签页
都依托 `ctx.effect`，因此卸载插件时会一起撤下。

新的客户端插件通过 `window.__DSH_BOOT__` 进入浏览器，而它是在
宿主提供 index.html 时组装的 —— 因此首次安装需要重启宿主并重新加载页面。

## 时序

- **目录可见性** 在下一个 agent step 刷新。
- **加载拦截是即时的**：在某个 turn 中途关闭的技能，在该 turn 剩余部分都会被拒绝。

## 已知限制

1. **preset 层技能需要 preset 行。** 注册表会把最近作用域层的条目整体置于全局层之前，因此单独的宿主行无法抑制某个 agent preset 发现的技能。在该 preset 中挂载 `dsh-skill-preferences/preset`（见安装）。没有它，该插件在任何禁用了宿主 `skill-filesystem` 行的组合中都是惰性的。
2. **在宿主组合中精确挂载一次。** `ctx.settings.register()` 不分作用域层，在重复命名空间上会抛错，因此按每个 agent preset 挂载会在第二次挂载时失败。
3. **每次冷目录收集时，每个被抑制的技能会有一行警告**（`skill "x" from y ignored because a higher-priority skill already exists`）。那是注册表既有的遮蔽通知，不是错误。
4. **手动添加到 `disabled` 的名称没有描述**，直到它通过 UI 被启用再禁用一次，因为提示是在禁用时捕获的。

## 开发

```sh
pnpm build
pnpm test
```
