# 023 element-damage タスク

- [ ] T1 [main]           委譲の前の常時許可外の変更: `design-system/skillweave/MASTER.md` の「火力の表示」に属性の行と上限の注記を、「用語の統一」に属性期待値を足し、`design/master-data.md` §9 の 023 の前提の確認を Q184・Q205 の決定に書き換える（plan D17）     refs spec §受入基準 AC-5, AC-6, AC-13
- [ ] T2 [solver-agent]   属性の種類の定数（plan D1）、`DamageBase`・`DamageStats` の属性（plan D2）、`evaluateDamage` の属性値・属性期待値・蓄積値（plan D3）と、その単体テスト（plan D9 の構成の計算）     refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-11
- [ ] T3 [solver-agent]   目的関数 `expectedElement`（plan D4）、要求の検証（plan D5）、属性期待値の ILP（plan D6）、支配の除外の適用（plan D7）、同点の順（plan D8）と、そのテスト（plan D9 の最大化・AC-8・AC-10・実データ）。Node の測定のケースを足して1件目までの時間の最大を報告する（plan D10）     refs spec §受入基準 AC-7, AC-8, AC-10, AC-11
- [ ] T4 [web-agent]      目的の選択肢と `toObjective`、`ResolvedWeapon` と 3 か所の `damageBase` の属性、選べないときの理由とエラーと `unavailableReason`（逆引きは止めない）、構成カードの見出し行・火力の2行目・上限の注記（plan D11）。単体テストの追加と、`damageBase` の `toEqual` 等の追従（plan D13）     refs spec §受入基準 AC-4, AC-5, AC-6, AC-9, AC-10
- [ ] T5 [e2e-agent]      5 属性・状態異常・無属性の武器の構成カードの属性の値と注記、属性の最大化の並び、目的を選べないときの理由と選んだ後のエラー（逆引きは有効のまま）を、実データの武器で確かめる（plan D12・D14）     refs spec §受入基準 AC-5, AC-6, AC-7, AC-9
- [ ] T6 [e2e-agent]      測定ハーネス `apps/web/e2e/measure/element-ui.measure.ts` を足し、`fillRequiredSkills` に武器の引数を足す（既存の測定は変えない）（plan D12・D15）     refs spec §受入基準 AC-12
- [ ] T7 [main]           `pnpm --filter @swv/web run measure --workers=1 e2e/measure/element-ui.measure.ts` で属性の最大化の時間を測り、`design/tech-stack.md` に新しい節で記録する。1件目までの時間の最大が 5 秒を超えたら区間 D を止めて報告する（plan D16）     refs spec §受入基準 AC-12
