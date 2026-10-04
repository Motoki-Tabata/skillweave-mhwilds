/**
 * packages/solver 入出力型（たたき台 v0）
 *
 * 卒業記録: 機能001で使う分（Brand・SkillId・ArmorId・DecorationId・Uuid・ArmorPart・SlotLevel・SlotTarget・Slot・SkillLevel・SolverStatus と、
 *   防具・装飾品・護石・武器の最小形）を `packages/solver/src/main/types.ts` へ移設済み。
 *   機能003で、ソルバーの入出力の型（Uuid・SolverCharm・SolverWeapon・Objective・SolverRequest・SlotOwner・SlotRef・SolvedBuild・SolverStatus・SolverResponse）と Worker のメッセージ型（WorkerInbound・WorkerOutbound）を
 *   `packages/solver/src/main/` へ移設済み（`SolveOptions` を追加）。火力に関わる型（SkillKind・EffectStat・Effect・ConditionId・`expectedDamage`）は未卒業（機能006）。
 *   機能002で、マスターの型（MasterVersion 以下の ID 型・MasterSkill・SetBonus・MasterArmor・MasterDecoration・MasterCharm・AppraisedCharmPattern・CharmSkillGroup・MasterWeapon・MasterBundle）を
 *   `packages/data/src/main/index.ts` へ移設済み（`source` と辞書の型 MasterDictionary・DictionaryEntry を追加）。
 *
 * 方針
 * - ソルバーは純粋関数。マスターやユーザーデータを自分で取りに行かない（受け取るだけ）。
 * - マスターの参照は文字列ID（ブランド型）。ユーザーデータはUUID。
 * - API（OpenAPI生成型）には依存しない。API型→ソルバー型の変換はapps/web側のアダプタで行う。
 * - 装飾品は「どのスロットに付けるか」ではなく「スロットLv別の個数」でILPを解き、
 *   具体的な配置は後処理で決める（大きいスロットには小さい珠も入るので貪欲法で割り当てられる）。
 */

// ---------------------------------------------------------------------------
// ID（ブランド型。取り違えをコンパイル時に防ぐ）
// ---------------------------------------------------------------------------
type Brand<T, B extends string> = T & { readonly __brand: B };

// マスターIDはゲーム内ID（gameId）から機械的に作る。表示名から作ると翻訳修正で変わるため。
export type MasterVersion = Brand<string, 'MasterVersion'>; // 例: "2026.09.1"
export type SkillId = Brand<string, 'SkillId'>; // 例: "sk:850626240"
export type ArmorId = Brand<string, 'ArmorId'>; // 例: "ar:-2117203456:head"（防具セットのgameId＋部位）
export type DecorationId = Brand<string, 'DecorationId'>; // 例: "dc:-2144349312"
export type WeaponId = Brand<string, 'WeaponId'>; // 例: "wp:charge-blade:22"（gameIdは武器種内でのみ一意）
export type CharmId = Brand<string, 'CharmId'>; // 生産護石。例: "ch:-2084662144:1"（gameId＋ランク）
export type SetBonusId = Brand<string, 'SetBonusId'>;
export type ConditionId = Brand<string, 'ConditionId'>; // 例: "cond.monster_enraged"
export type Uuid = Brand<string, 'Uuid'>; // ユーザーデータ（UUIDv7・クライアント採番）

// ---------------------------------------------------------------------------
// 共通の部品
// ---------------------------------------------------------------------------
export type ArmorPart = 'head' | 'chest' | 'arms' | 'waist' | 'legs';
export type SlotLevel = 1 | 2 | 3 | 4; // ワイルズ現行は3まで。過去作・拡張に備えて4まで許す
export type SlotTarget = 'weapon' | 'armor'; // 武器用珠／防具用珠

/** スロット1つ。護石のスロット種別が確定していないため、部位側ではなくスロット側に種別を持たせる */
export interface Slot {
  target: SlotTarget;
  level: SlotLevel;
}

export interface SkillLevel {
  skillId: SkillId;
  level: number; // 1以上
}

// ---------------------------------------------------------------------------
// マスターデータ（packages/data が配信するJSONの形）
// ---------------------------------------------------------------------------
export type SkillKind = 'weapon' | 'armor' | 'series' | 'group';

/** 火力計算用の効果。データ駆動にして、スキル追加でコードを変えずに済むようにする */
export type EffectStat =
  | 'attack_add'
  | 'attack_mul'
  | 'affinity_add'
  | 'crit_mul' // 会心倍率
  | 'element_add'
  | 'element_mul';

export interface Effect {
  stat: EffectStat;
  value: number;
  /** 発動条件。未指定なら常時。条件の有無はユーザーがトグルで決める */
  conditionId?: ConditionId;
}

export interface MasterSkill {
  id: SkillId;
  kind: SkillKind;
  maxLevel: number;
  /** index 0 = Lv1 の効果。火力に関係しないスキルは空配列。手作業のオーバーレイで埋める */
  effectsByLevel: Effect[][];
  /** 極意スキル（アセンダンスで復活予定）：発動中は対象スキルの上限が maxLevel になる */
  raisesMaxLevel?: { skillId: SkillId; maxLevel: number };
}

/** シリーズスキル・グループスキル：同じセットの部位数に応じてスキルが付く */
export interface SetBonus {
  id: SetBonusId;
  skillId: SkillId;
  /** 例: [{ pieces: 2, level: 1 }, { pieces: 4, level: 2 }] */
  thresholds: { pieces: number; level: number }[];
}

export interface MasterArmor {
  id: ArmorId;
  part: ArmorPart;
  rarity: number;
  slots: Slot[];
  skills: SkillLevel[];
  setBonusIds: SetBonusId[]; // シリーズ・グループの両方を入れる
  defense: number;
}

export interface MasterDecoration {
  id: DecorationId;
  target: SlotTarget;
  slotLevel: SlotLevel;
  skills: SkillLevel[]; // 複合珠に備えて配列
}

/** 生産護石（スキル固定）。所持していれば SolverCharm に展開してソルバーに渡す */
export interface MasterCharm {
  id: CharmId;
  rarity: number;
  skills: SkillLevel[];
  slots: Slot[];
}

/**
 * 鑑定護石の抽選テーブル（レア度ごとのスキル枠グループとスロットパターン）。
 * 手入力・OCR結果の妥当性チェックと、フェーズ③の逆引きに使う。ソルバー本体は使わない。
 */
export interface AppraisedCharmPattern {
  rarity: number;
  /** スキル1〜3それぞれに入りうるスキルグループ（null は枠なし） */
  skillGroups: (string | null)[];
  slotPatterns: Slot[][];
}

export interface CharmSkillGroup {
  group: string; // 例: "A"
  skills: SkillLevel[]; // このグループから出うるスキルとレベル
}

export interface MasterWeapon {
  id: WeaponId;
  weaponType: string; // text + CHECK と同じ発想。値の一覧は data 側で定義
  attack: number;
  affinity: number;
  element?: { type: string; value: number };
  slots: Slot[];
  skills: SkillLevel[];
  setBonusIds: SetBonusId[];
}

export interface MasterBundle {
  version: MasterVersion;
  skills: MasterSkill[];
  setBonuses: SetBonus[];
  armors: MasterArmor[];
  decorations: MasterDecoration[];
  weapons: MasterWeapon[];
  charms: MasterCharm[];
  appraisedCharm: {
    patterns: AppraisedCharmPattern[];
    groups: CharmSkillGroup[];
  };
}

// ---------------------------------------------------------------------------
// ソルバー入力（ユーザーデータ由来の部分はソルバー専用の最小形）
// ---------------------------------------------------------------------------
export interface SolverCharm {
  id: Uuid;
  rarity: number;
  skills: SkillLevel[];
  slots: Slot[];
}

/** 武器は固定で渡す（武器も探索対象にするのは後回し） */
export type SolverWeapon =
  | { kind: 'master'; weaponId: WeaponId }
  | {
      kind: 'custom'; // アーティア等の個体差のある武器
      id: Uuid;
      baseWeaponId: WeaponId;
      attack: number;
      affinity: number;
      element?: { type: string; value: number };
      slots: Slot[];
      skills: SkillLevel[];
      setBonusIds: SetBonusId[];
    };

export type Objective =
  | { kind: 'feasible' } // 条件を満たす構成を列挙するだけ
  | { kind: 'maximize'; metric: 'expectedDamage' | 'defense' | 'freeSlots' };

export interface SolverRequest {
  masterVersion: MasterVersion; // Worker が持っている MasterBundle と一致しなければ拒否
  weapon: SolverWeapon;
  charms: SolverCharm[]; // 候補（所持護石）。空なら護石なしで解く
  required: SkillLevel[]; // 必須スキル（level は下限）
  /** 部位を固定する。null は「何も付けない」 */
  fixedArmor?: Partial<Record<ArmorPart, ArmorId | null>>;
  excludedArmorIds?: ArmorId[];
  /** 火力計算で「発動している」とみなす条件 */
  activeConditionIds?: ConditionId[];
  objective: Objective;
  maxResults: number;
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// ソルバー出力
// ---------------------------------------------------------------------------
export type SlotOwner = 'weapon' | ArmorPart | 'charm';

export interface SlotRef {
  owner: SlotOwner;
  index: number; // その持ち主の slots[] の添字
}

export interface SolvedBuild {
  armor: Record<ArmorPart, ArmorId | null>;
  charmId: Uuid | null;
  decorations: { slot: SlotRef; decorationId: DecorationId }[];
  /** 発動スキル（maxLevel で頭打ちした後の値）と、頭打ち前の合計 */
  skills: { skillId: SkillId; level: number; rawLevel: number }[];
  freeSlots: SlotRef[];
  score?: number; // objective が maximize のときの値
}

export type SolverStatus = 'optimal' | 'feasible' | 'infeasible' | 'timeout';

export interface SolverResponse {
  status: SolverStatus;
  builds: SolvedBuild[];
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Worker とのメッセージ（マスターは最初に1回だけ送る）
// ---------------------------------------------------------------------------
export type WorkerInbound =
  | { type: 'loadMaster'; bundle: MasterBundle }
  | { type: 'solve'; requestId: string; request: SolverRequest }
  | { type: 'cancel'; requestId: string };

export type WorkerOutbound =
  | { type: 'masterLoaded'; version: MasterVersion }
  | { type: 'progress'; requestId: string; found: number }
  | { type: 'result'; requestId: string; response: SolverResponse }
  | { type: 'error'; requestId: string; message: string };
