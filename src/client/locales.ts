/** Copy dictionaries for the Skills settings tab. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  tab: 'Skill 管理',
  loading: '正在读取 Skill…',
  error: '暂时无法读取 Skill。',
  retry: '重试',
  search: '搜索 Skill',
  empty: '暂无 Skill。',
  emptySearch: '没有匹配的 Skill。',
  countLabel: 'Skill 数量',
  enabled: '已启用',
  disabled: '已关闭',
  saveFailed: '保存失败，已恢复为服务端的状态。',
  modelInvocation: '模型调用',
  userInvocation: '用户调用',
  allowed: '允许',
  blocked: '禁止',
  source: '来源',
  nextTurnNotice: '关闭后，模型的 Skill 目录在下一轮刷新；正在进行的加载会立即被拒绝。',
  toggleLabel: '开关 {name}',
} satisfies Record<string, string>

/** Skill preferences locale key union. */
export type SkillPreferencesLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  tab: 'Skills',
  loading: 'Reading skills…',
  error: 'Skills are unavailable right now.',
  retry: 'Retry',
  search: 'Search skills',
  empty: 'No skills.',
  emptySearch: 'No matching skills.',
  countLabel: 'Skill count',
  enabled: 'On',
  disabled: 'Off',
  saveFailed: 'Save failed; the list was restored from the host.',
  modelInvocation: 'Model invocation',
  userInvocation: 'User invocation',
  allowed: 'Allowed',
  blocked: 'Blocked',
  source: 'Source',
  nextTurnNotice: 'A skill turned off leaves the model catalog on the next turn; a load already in flight is refused immediately.',
  toggleLabel: 'Toggle {name}',
} satisfies Record<SkillPreferencesLocaleKey, string>
