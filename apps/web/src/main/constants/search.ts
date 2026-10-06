/** 件数の範囲と既定（decisions.md Q20）。 */
export const MAX_RESULTS_MIN = 1
export const MAX_RESULTS_MAX = 30
export const MAX_RESULTS_DEFAULT = 10

/**
 * 検索の時間の上限（ミリ秒）。画面に入力欄を持たない。
 * 既定の件数（10）での測定は 0.3 秒程度で、30 件でも 7.7 秒以下なので、通常の検索で打ち切りが起きない値にする。
 */
export const SOLVE_TIMEOUT_MS = 30000

/** D1 の武器の一覧に出す件数の上限。 */
export const WEAPON_LIST_LIMIT = 50

/** 読み込みのスケルトンを出すまでの時間（ミリ秒）。これより短い読み込みでは何も出さない。 */
export const LOADING_SKELETON_DELAY_MS = 300

/** トーストを出しておく時間（ミリ秒）。 */
export const TOAST_DURATION_MS = 4000
