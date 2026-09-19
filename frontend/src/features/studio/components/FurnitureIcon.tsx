import { Armchair, Flower2, Sofa, Table2 } from "lucide-react"

export function FurnitureIcon({
  category,
  size = 28,
}: {
  category: string
  size?: number
}) {
  if (category === "소파") return <Sofa size={size} strokeWidth={1.5} />
  if (category === "테이블") return <Table2 size={size} strokeWidth={1.5} />
  if (category === "의자") return <Armchair size={size} strokeWidth={1.5} />
  return <Flower2 size={size} strokeWidth={1.5} />
}
