export const maxProjectNameGraphemes = 80
export const maxProjectNameLength = 1024
export const maxChatLength = 1000
export const maxFurnitureCount = 200

// UTF-16 limits match Java String.length(). Graphemes are a browser UI policy.
export function projectNameError(value: string): string | null {
  if (!value.trim()) return "프로젝트 이름을 입력해 주세요."
  if (value.length > maxProjectNameLength)
    return "프로젝트 이름의 결합 문자가 너무 길어요. 이름을 줄여 주세요."
  let count = 0
  for (const _segment of new Intl.Segmenter("ko", {
    granularity: "grapheme",
  }).segment(value)) {
    if (++count > maxProjectNameGraphemes)
      return "프로젝트 이름은 80글자 이내로 입력해 주세요."
  }
  return null
}

export function chatInputError(value: string): string | null {
  if (!value.trim()) return "가구 배치 요청을 입력해 주세요."
  if (value.length > maxChatLength)
    return "요청은 1000자 이내로 줄여 주세요. 이모지는 여러 자로 계산될 수 있어요."
  return null
}

export function assertFurnitureCount(count: number): void {
  if (count > maxFurnitureCount)
    throw new Error("가구는 최대 200개까지 배치할 수 있어요.")
}
