import { useState } from "react"
import {
  IconChevronLeftLine,
  IconChevronRightLine,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon"
import { ActionButton, Icon, ScrollFog } from "@seed-design/react"
import {
  ChipTabsCarousel,
  ChipTabsList,
  ChipTabsRoot,
  ChipTabsTrigger,
} from "seed-design/ui/chip-tabs"
import { List, ListButtonItem } from "seed-design/ui/list"
import { TabsList, TabsRoot, TabsTrigger } from "seed-design/ui/tabs"
import { TextField, TextFieldInput } from "seed-design/ui/text-field"

import { Type } from "@/components/kokoro/Type"
import { catalog } from "@/features/studio/data"
import { formatMeters, formatPrice } from "@/features/studio/format"
import {
  furniturePrice,
  roomArea,
  roomForFurniture,
} from "@/features/studio/house-navigation"
import type { Category, Furniture, Project } from "@/features/studio/types"
import type { PlacementIssue } from "@/features/studio/placement-issues"

import { FurnitureThumb } from "./FurnitureThumb"
import { PlacementIssueList } from "./PlacementIssueList"

const categories: Category[] = ["전체", "소파", "테이블", "의자", "장식"]

function sumPrice(items: Furniture[]) {
  return items.reduce((total, item) => total + furniturePrice(item), 0)
}

export function RoomNavigator({
  project,
  roomIndex,
  tab,
  category,
  selectedId,
  onRoomChange,
  onTabChange,
  onCategoryChange,
  onAddFurniture,
  onSelectFurniture,
  issues,
  onSelectIssue,
}: {
  project: Project
  roomIndex: number | null
  tab: "furniture" | "placed"
  category: Category
  selectedId: string | null
  onRoomChange: (index: number | null) => void
  onTabChange: (tab: "furniture" | "placed") => void
  onCategoryChange: (category: Category) => void
  onAddFurniture: (catalogId: string) => void
  onSelectFurniture: (id: string) => void
  issues: PlacementIssue[]
  onSelectIssue: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const rooms = project.room?.rooms ?? []
  const room = roomIndex === null ? null : rooms[roomIndex]
  const issueList = (
    <PlacementIssueList
      furniture={project.furniture}
      issues={issues}
      selectedId={selectedId}
      onSelect={onSelectIssue}
    />
  )

  if (!room) {
    return (
      <div className="panel">
        <header className="panel-header">
          <Type variant="title" as="h2">
            집 전체
          </Type>
          <Type variant="caption">
            방 {rooms.length}개 · 가구 {project.furniture.length}개
          </Type>
        </header>
        <div className="panel-body">
          {issueList}
          <Type variant="description" as="p" className="panel-intro">
            꾸밀 방을 고르세요. 평면도에서 방을 눌러도 돼요.
          </Type>
          <List className="room-list">
            {rooms.map((label, index) => {
              const items = project.furniture.filter(
                (item) => roomForFurniture(rooms, item) === index
              )
              return (
                <ListButtonItem
                  key={`${label.name}-${index}`}
                  title={label.name}
                  detail={
                    items.length
                      ? `가구 ${items.length}개 · ${formatPrice(sumPrice(items))}`
                      : "비어 있어요"
                  }
                  suffix={<Icon svg={<IconChevronRightLine />} size="x4" />}
                  onClick={() => onRoomChange(index)}
                />
              )
            })}
          </List>
        </div>
        <footer className="panel-footer panel-total">
          <Type variant="caption">예상 가구 비용</Type>
          <Type variant="title" numeric>
            {formatPrice(sumPrice(project.furniture))}
          </Type>
        </footer>
      </div>
    )
  }

  const roomFurniture = project.furniture.filter(
    (item) => roomForFurniture(rooms, item) === roomIndex
  )
  const normalizedQuery = query.normalize("NFC").trim().toLowerCase()
  const visibleCatalog = catalog.filter(
    (item) =>
      (category === "전체" || item.category === category) &&
      [item.name, item.category].some((value) =>
        value.normalize("NFC").toLowerCase().includes(normalizedQuery)
      )
  )

  return (
    <div className="panel">
      <header className="panel-header panel-header-back">
        <ActionButton
          variant="ghost"
          size="small"
          layout="iconOnly"
          aria-label="집 전체로 돌아가기"
          onClick={() => onRoomChange(null)}
        >
          <Icon svg={<IconChevronLeftLine />} size="x5" />
        </ActionButton>
        <div className="panel-header-text">
          <Type variant="title" as="h2" maxLines={1}>
            {room.name}
          </Type>
          <Type variant="caption" numeric>
            {roomArea(room).toFixed(1)} m² · 가구 {roomFurniture.length}개 ·{" "}
            {formatPrice(sumPrice(roomFurniture))}
          </Type>
        </div>
      </header>
      <TabsRoot
        className="panel-tabs"
        value={tab}
        onValueChange={(value) => onTabChange(value as typeof tab)}
        triggerLayout="fill"
        size="small"
      >
        <TabsList aria-label="가구 보기">
          <TabsTrigger value="furniture">가구 추가</TabsTrigger>
          <TabsTrigger value="placed">
            배치한 가구 {roomFurniture.length}
          </TabsTrigger>
        </TabsList>
      </TabsRoot>
      {tab === "furniture" ? (
        <div className="panel-body">
          {issueList}
          <ChipTabsRoot
            className="category-tabs"
            variant="neutralSolid"
            size="medium"
            value={category}
            onValueChange={(value) => onCategoryChange(value as Category)}
          >
            <ChipTabsCarousel>
              <ScrollFog placement={["left", "right"]}>
                <ChipTabsList
                  aria-label="가구 종류"
                  className="category-tabs-list"
                >
                  {categories.map((entry) => (
                    <ChipTabsTrigger key={entry} value={entry}>
                      {entry}
                    </ChipTabsTrigger>
                  ))}
                </ChipTabsList>
              </ScrollFog>
            </ChipTabsCarousel>
          </ChipTabsRoot>
          <div className="catalog-search">
            <TextField
              label="가구 검색"
              size="medium"
              value={query}
              onValueChange={({ value }) => setQuery(value)}
            >
              <TextFieldInput
                type="search"
                placeholder="이름이나 종류로 찾기"
                maxLength={80}
              />
            </TextField>
          </div>
          {visibleCatalog.length === 0 && (
            <div className="panel-empty">
              <Type variant="description" as="p" role="status">
                조건에 맞는 가구가 없어요
              </Type>
              <ActionButton
                variant="neutralWeak"
                size="small"
                onClick={() => {
                  setQuery("")
                  onCategoryChange("전체")
                }}
              >
                필터 초기화
              </ActionButton>
            </div>
          )}
          <List className="catalog-list">
            {visibleCatalog.map((item) => (
              <ListButtonItem
                key={item.id}
                prefix={
                  <FurnitureThumb category={item.category} color={item.color} />
                }
                title={item.name}
                detail={formatPrice(item.price)}
                suffix={<Icon svg={<IconPlusLine />} size="x4" />}
                aria-label={`${item.name} ${room.name}에 놓기`}
                onClick={() => onAddFurniture(item.id)}
              />
            ))}
          </List>
        </div>
      ) : roomFurniture.length === 0 ? (
        <div className="panel-body panel-empty">
          {issueList}
          <Type variant="heading" as="p">
            아직 이 방에 놓은 가구가 없어요
          </Type>
          <Type variant="description" as="p">
            가구 추가에서 고르거나 AI 배치에 원하는 모습을 적어 보세요.
          </Type>
          <ActionButton
            variant="neutralWeak"
            size="small"
            onClick={() => onTabChange("furniture")}
          >
            가구 고르기
          </ActionButton>
        </div>
      ) : (
        <div className="panel-body">
          {issueList}
          <List className="catalog-list">
            {roomFurniture.map((item) => (
              <ListButtonItem
                key={item.id}
                data-furniture-id={item.id}
                highlighted={selectedId === item.id}
                aria-pressed={selectedId === item.id}
                prefix={
                  <FurnitureThumb category={item.category} color={item.color} />
                }
                title={item.name}
                detail={`${formatMeters(item.x)} × ${formatMeters(item.z)} · ${item.rotation}°`}
                onClick={() => onSelectFurniture(item.id)}
              />
            ))}
          </List>
        </div>
      )}
    </div>
  )
}
