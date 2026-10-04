import type { TextProps } from "@seed-design/react"

/**
 * 코코로의 타이포그래피 규칙입니다. 글자 크기와 두께는 보기 좋은 값이 아니라
 * 글이 맡은 의미로 고릅니다. 새 화면도 이 표에 있는 역할만 사용합니다.
 */
export const typeRoles = {
  /** 화면 하나를 대표하는 제목. 한 화면에 하나만 둡니다. */
  display: { textStyle: "screenTitle", color: "fg.neutral" },
  /** 패널 제목과 지금 선택한 대상의 이름 */
  title: { textStyle: "t6Bold", color: "fg.neutral" },
  /** 패널 안에서 내용을 묶는 소제목 */
  heading: { textStyle: "t5Bold", color: "fg.neutral" },
  /** 사용자가 읽어야 하는 문장. 대화와 안내 문단 */
  body: { textStyle: "t5Regular", color: "fg.neutral" },
  /** 제목이나 조작을 돕는 짧은 설명 */
  description: { textStyle: "t4Regular", color: "fg.neutralMuted" },
  /** 항목과 필드의 이름처럼 대상을 가리키는 짧은 글 */
  label: { textStyle: "t4Medium", color: "fg.neutral" },
  /** 개수와 단위와 상태 같은 부가 정보 */
  caption: { textStyle: "t3Regular", color: "fg.neutralMuted" },
} as const satisfies Record<
  string,
  { textStyle: NonNullable<TextProps["textStyle"]>; color: TextProps["color"] }
>

export type TypeRole = keyof typeof typeRoles
