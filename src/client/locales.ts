export const en = {
  nav: 'Skill Manager',
  title: 'Skill Manager',
  introduction: 'Browse and manage Skills.sh skills without leaving DSH.',
  searchLabel: 'Search Skills.sh',
  searchPlaceholder: 'Try react, testing, or debugging',
  searchAction: 'Search',
  searching: 'Searching Skills.sh...',
  empty: 'No matching skills were found.',
  descriptionUnavailable: 'No description is currently available.',
  installs: 'installs',
  openPage: 'Open on Skills.sh',
  retry: 'Retry',
  genericError: 'The search failed. Try again.',
}

export type LocaleKey = keyof typeof en

export const zh = {
  nav: '技能管理',
  title: '技能管理',
  introduction: '无需离开 DSH，即可浏览和管理 Skills.sh 技能。',
  searchLabel: '搜索 Skills.sh',
  searchPlaceholder: '例如 react、测试或调试',
  searchAction: '搜索',
  searching: '正在搜索 Skills.sh……',
  empty: '没有找到匹配的技能。',
  descriptionUnavailable: '暂时无法获取技能简介。',
  installs: '次安装',
  openPage: '在 Skills.sh 上查看',
  retry: '重试',
  genericError: '搜索失败，请重试。',
} satisfies Record<LocaleKey, string>

export type Translate = (key: LocaleKey) => string
