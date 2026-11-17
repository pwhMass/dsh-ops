# 原子暂存与长文件名

[English](atomic-staging.md)

固定文件写操作先在目标的私有同目录临时文件中写入未发布内容，再按现有原子/禁止覆盖流程恢复元数据、同步并发布。合法的长目标文件名不应要求一个更长的临时文件名。

当前暂存名为 `.dsh-ops-tmp-<64位十六进制目标键>-<v4-UUID>`，固定 **114 ASCII 字节**，与目标 UTF-8 字节长度无关。目标键与更新锁共用对小写 basename 求 SHA-256 的规则；每次暂存以新 UUID 区分，摘要不代表权限。这样可支持合法的 209、210、255 字节 POSIX basename（包括中文与 emoji），不用截断 UTF-8。

- 覆盖/edit/replace 与只创建 write/copy 共用此有界名字。
- 更新锁命名及其权限、生命周期不变。
- 持有目标更新锁时，清理只识别本目标键加完整 RFC 4122 v4 UUID，及精确旧格式 `.<target>.dsh-ops-<v4-UUID>`。其他目标、近似格式及用户备份不会被清除。
- 搜索复用发布层分类器；新旧临时文件即使在 `includeHidden: true` 或显式路径下也保持内部内容不可见。只有完整生成格式匹配才属于内部文件，仅以前缀 `.dsh-ops-tmp-` 开头仍是用户内容。
- 同目录句柄相对创建、不跟随链接、初始私有权限、revision/CAS、元数据恢复和副作用报告均不变。命名修复不增加写权限，也不允许覆盖原本只创建流程会拒绝的目标。

Windows 文件名限制的计量单位不同，POSIX 字节边界测试在那里明确跳过；跨平台验收仍需要对应平台的发布测试。

验证命令：构建匹配源码的 native worker 后执行 `node test/run.mjs long-basename-mutations lock-sidecar replace-concurrency`。Rust 分类器单测位于 `ops-files::atomic_staging`。
