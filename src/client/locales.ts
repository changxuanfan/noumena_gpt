export const en = {
  nav: 'Skill Manager',
  title: 'Skill Manager',
  introduction: 'Browse and manage Skills.sh skills without leaving DSH.',
}

export type LocaleKey = keyof typeof en

export const zh = {
  nav: '技能管理',
  title: '技能管理',
  introduction: '无需离开 DSH，即可浏览和管理 Skills.sh 技能。',
} satisfies Record<LocaleKey, string>

export type Translate = (key: LocaleKey) => string
