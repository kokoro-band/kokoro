import { Text, type TextProps } from "@seed-design/react"

import { typeRoles, type TypeRole } from "./type-roles"

export interface TypeProps extends Omit<TextProps, "textStyle"> {
  variant: TypeRole
  /** 금액과 치수처럼 자릿수를 맞춰 읽어야 하는 숫자 */
  numeric?: boolean
}

export function Type({
  variant,
  numeric,
  className,
  color,
  ...props
}: TypeProps) {
  const spec = typeRoles[variant]
  return (
    <Text
      textStyle={spec.textStyle}
      color={color ?? spec.color}
      className={[numeric ? "type-numeric" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}
