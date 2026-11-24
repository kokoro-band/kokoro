const money = new Intl.NumberFormat("ko-KR")

export function formatPrice(value: number) {
  return `₩${money.format(value)}`
}

export function formatMeters(value: number) {
  return `${value.toFixed(1)} m`
}

/** 받침이 없거나 ㄹ 받침이면 "로", 다른 받침이면 "으로"를 붙입니다. */
export function withDirectionParticle(word: string) {
  const last = word.trim().at(-1)
  if (!last) return word
  const code = last.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return `${word}로`
  const final = code % 28
  return `${word}${final === 0 || final === 8 ? "로" : "으로"}`
}

/** 마지막 글자에 받침이 있으면 "을", 없으면 "를"을 붙입니다. */
export function withObjectParticle(word: string) {
  const last = word.trim().at(-1)
  if (!last) return word
  const code = last.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return `${word}를`
  return `${word}${code % 28 === 0 ? "를" : "을"}`
}
