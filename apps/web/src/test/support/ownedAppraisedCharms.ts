import type { SkillId, SkillLevel, Slot } from '@swv/data'
import type { CharmPayload } from '@/lib/charms/types'

const s = (skillId: string, level: number): SkillLevel => ({ skillId: skillId as SkillId, level })
const w = (level: Slot['level']): Slot => ({ target: 'weapon', level })
const a = (level: Slot['level']): Slot => ({ target: 'armor', level })

/**
 * オーナーの手持ちの鑑定護石 20 件（ゲームの表示順のまま）。
 * 出典は packages/data/.cache/appraised-charm/out/owned-charms.json（非コミット）の書き写し。
 * 各スキル行のコメントは ja の名前。
 */
export const ownedAppraisedCharms: CharmPayload[] = [
  {
    rarity: 8,
    skills: [
      s('sk:-2096489472', 3), // 見切り
      s('sk:632127488', 1), // 渾身
      s('sk:1346775424', 1), // 精霊の加護
    ],
    slots: [w(1), a(1)],
  },
  {
    rarity: 8,
    skills: [
      s('sk:1452140672', 3), // 雷属性攻撃強化
      s('sk:-397570464', 1), // 弱点特効
    ],
    slots: [w(1), a(1)],
  },
  {
    rarity: 8,
    skills: [
      s('sk:686533440', 3), // 抜刀術【技】
      s('sk:-1073401280', 2), // 納刀術
      s('sk:705317568', 1), // 気絶耐性
    ],
    slots: [w(1)],
  },
  {
    rarity: 8,
    skills: [
      s('sk:-420608864', 3), // 弾導強化
      s('sk:1763191040', 1), // 力の解放
    ],
    slots: [w(1), a(1)],
  },
  {
    rarity: 8,
    skills: [
      s('sk:1', 3), // 攻撃
      s('sk:634068352', 2), // 早食い
      s('sk:-2125233152', 1), // 龍耐性
    ],
    slots: [w(1), a(1)],
  },
  {
    rarity: 8,
    skills: [
      s('sk:1389859584', 1), // 達人芸
      s('sk:1966172160', 2), // 拘束耐性
      s('sk:1425756032', 1), // 火耐性
    ],
    slots: [w(1), a(1)],
  },
  {
    rarity: 8,
    skills: [
      s('sk:-168922880', 3), // 会心撃【特殊】
      s('sk:-397570464', 1), // 弱点特効
    ],
    slots: [w(1)],
  },
  {
    rarity: 8,
    skills: [
      s('sk:1452140672', 3), // 雷属性攻撃強化
      s('sk:-397570464', 1), // 弱点特効
    ],
    slots: [w(1), a(1), a(1)],
  },
  {
    rarity: 8,
    skills: [
      s('sk:552982656', 1), // 貫通弾・竜の矢強化
      s('sk:1865909632', 1), // 挑戦者
    ],
    slots: [w(1)],
  },
  {
    rarity: 8,
    skills: [
      s('sk:1160639488', 3), // 匠
      s('sk:-315492576', 1), // スタミナ急速回復
      s('sk:-2125233152', 1), // 龍耐性
    ],
    slots: [w(1), a(1), a(1)],
  },
  {
    rarity: 7,
    skills: [
      s('sk:313598432', 2), // 会心撃【属性】
      s('sk:1050520384', 1), // 業物
      s('sk:894530496', 4), // 広域化
    ],
    slots: [a(2)],
  },
  {
    rarity: 7,
    skills: [
      s('sk:313598432', 2), // 会心撃【属性】
      s('sk:1', 1), // 攻撃
      s('sk:2106877312', 1), // フルチャージ
    ],
    slots: [a(2)],
  },
  {
    rarity: 6,
    skills: [
      s('sk:-562534336', 1), // 火属性攻撃強化
      s('sk:166057120', 1), // 睡眠属性強化
      s('sk:-2125233152', 3), // 龍耐性
    ],
    slots: [a(2), a(1)],
  },
  {
    rarity: 6,
    skills: [
      s('sk:-562534336', 2), // 火属性攻撃強化
      s('sk:-481419552', 2), // キノコ大好き
    ],
    slots: [a(2), a(1)],
  },
  {
    rarity: 5,
    skills: [
      s('sk:686533440', 1), // 抜刀術【技】
      s('sk:424768352', 2), // 環境適応
      s('sk:-1662120192', 2), // 無我の境地
    ],
    slots: [a(3)],
  },
  {
    rarity: 5,
    skills: [
      s('sk:1758661504', 1), // スタミナ奪取
      s('sk:-1121468544', 2), // 回復速度
      s('sk:-1235658624', 2), // 体力回復量ＵＰ
    ],
    slots: [a(3)],
  },
  {
    rarity: 5,
    skills: [
      s('sk:-776946176', 1), // 龍属性攻撃強化
      s('sk:1763191040', 1), // 力の解放
    ],
    slots: [a(3)],
  },
  {
    rarity: 5,
    skills: [
      s('sk:686533440', 1), // 抜刀術【技】
      s('sk:1077686656', 3), // 防御
      s('sk:-682586176', 2), // ランナー
    ],
    slots: [a(2), a(1)],
  },
  {
    rarity: 5,
    skills: [
      s('sk:1500129152', 1), // 剛刃研磨
      s('sk:820385792', 3), // 爆破やられ耐性
    ],
    slots: [a(3)],
  },
  {
    rarity: 7,
    skills: [
      s('sk:-2096489472', 3), // 見切り
      s('sk:1174975744', 1), // 巧撃
    ],
    slots: [a(2)],
  },
]
