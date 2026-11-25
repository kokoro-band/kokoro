import { useState, type RefObject } from "react"
import { IconArrowRightLine } from "@karrotmarket/react-monochrome-icon"
import { ActionButton, PrefixIcon } from "@seed-design/react"
import {
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "seed-design/ui/menu"

import { Type } from "@/components/kokoro/Type"

export function FurnitureRoomMenu({
  targets,
  onMove,
  compact = false,
  menuContainer,
}: {
  targets: { index: number; name: string }[]
  onMove: (index: number) => void
  compact?: boolean
  menuContainer?: RefObject<HTMLElement | null>
}) {
  const [open, setOpen] = useState(false)
  return (
    <MenuRoot
      placement={compact ? "top-end" : "bottom-start"}
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (details?.reason === "escapeKeyDown") details.event.stopPropagation()
        setOpen(nextOpen)
      }}
    >
      <MenuTrigger asChild>
        <ActionButton variant="neutralWeak" size={compact ? "small" : "medium"}>
          {!compact && <PrefixIcon svg={<IconArrowRightLine />} />}
          {compact ? "방 이동" : "다른 방으로 옮기기"}
        </ActionButton>
      </MenuTrigger>
      <MenuContent
        aria-label="옮길 방"
        className="furniture-room-menu"
        positionerContainer={menuContainer}
      >
        <MenuGroup>
          {targets.map((target) => (
            <MenuItem
              key={target.index}
              label={
                <Type variant="label" maxLines={1} title={target.name}>
                  {target.name}
                </Type>
              }
              onClick={() => onMove(target.index)}
            />
          ))}
        </MenuGroup>
      </MenuContent>
    </MenuRoot>
  )
}
