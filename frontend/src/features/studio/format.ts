const money = new Intl.NumberFormat("ko-KR")

export function formatPrice(value: number) {
  return `₩${money.format(value)}`
}

export function formatMeters(value: number) {
  return `${value.toFixed(1)} m`
}

/** 마지막 글자에 받침이 있으면 "을", 없으면 "를"을 붙입니다. */
export function withObjectParticle(word: string) {
  const last = word.trim().at(-1)
  if (!last) return word
  const code = last.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return `${word}를`
  return `${word}${code % 28 === 0 ? "를" : "을"}`
}
