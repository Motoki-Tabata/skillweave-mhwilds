import type { MasterBundle } from '@swv/data'
import type { Highs } from 'highs'
import { expect } from 'vitest'
import type { SolveOptions, SolverRequest, SolverResponse } from '../../main/request'
import { solveBuilds } from '../../main/solveBuilds'
import { armorCharmKey, verifyBuild } from './verifyBuild'

/**
 * 偽の時計。実時間は使わない。`yieldControl` を呼ぶたびに `stepMs` だけ進む
 * （求解の前に必ず呼ばれるので、求解 1 回につき `stepMs` 進む偽の時計になる）。
 */
export interface FakeClock {
  readonly options: SolveOptions
  /** 現在の偽の時刻（ミリ秒） */
  time: () => number
}

export function fakeClock(
  stepMs = 0,
  extra: Pick<SolveOptions, 'isCancelled' | 'onProgress'> = {},
): FakeClock {
  let current = 0
  return {
    time: () => current,
    options: {
      now: () => current,
      yieldControl: () => {
        current += stepMs
        return Promise.resolve()
      },
      ...extra,
    },
  }
}

/** 偽の時計（進まない）で解く */
export function solve(
  highs: Highs,
  master: MasterBundle,
  request: SolverRequest,
): Promise<SolverResponse> {
  return solveBuilds(highs, master, request, fakeClock().options)
}

/**
 * 解いて、返したすべての構成にソルバーと独立の検算を掛ける（受入基準 13）。
 * 防具と護石の組が重ならないことも確かめる（受入基準 7）。
 */
export async function solveVerified(
  highs: Highs,
  master: MasterBundle,
  request: SolverRequest,
): Promise<SolverResponse> {
  const response = await solve(highs, master, request)
  for (const build of response.builds) {
    expect(verifyBuild(master, request, build)).toEqual([])
  }
  const keys = response.builds.map(armorCharmKey)
  expect(new Set(keys).size).toBe(keys.length)
  return response
}
