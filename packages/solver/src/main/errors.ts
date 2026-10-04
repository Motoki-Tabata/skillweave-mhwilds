/** 要求そのものが誤っているとき（解なしとは分ける） */
export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidRequestError'
  }
}

/** キャンセルされた要求の打ち切り */
export class SolveCancelledError extends Error {
  constructor() {
    super('求解がキャンセルされた')
    this.name = 'SolveCancelledError'
  }
}
