/*
THESIS: Kokoro turns choosing a study seat into one calm and visible operating decision.
OWN-WORLD: A white and ink seat-control board uses one electric-green rail to carry the active choice from summary to map.
STORY: Pick a time, inspect the room, choose one available seat, and enter with a single confirmed action.
FIRST VIEWPORT: The active room map dominates the right side while the booking decision stays visible on the left.
FORM: Arcade operations board, grounded direction 3, seed 3cd5a999.
FINISH: finish reviewer disposition pass; DESIGN.md and the design sidecar capture the shipped visual system.
*/
import { useLayoutEffect, useRef, useState } from "react"
import {
  ArrowRight,
  Clock3,
  Headphones,
  MapPin,
  Mic2,
  Monitor,
  Users,
  VideoOff,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type SeatStatus = "available" | "occupied" | "away"

type Seat = {
  id: string
  status: SeatStatus
  zone: "quiet" | "group"
}

const timeSlots = ["19:00", "20:00", "21:00"]

const seats: Seat[] = [
  { id: "A1", status: "available", zone: "quiet" },
  { id: "A2", status: "occupied", zone: "quiet" },
  { id: "A3", status: "available", zone: "quiet" },
  { id: "A4", status: "away", zone: "quiet" },
  { id: "A5", status: "available", zone: "quiet" },
  { id: "A6", status: "available", zone: "quiet" },
  { id: "A7", status: "occupied", zone: "quiet" },
  { id: "A8", status: "available", zone: "quiet" },
  { id: "B1", status: "available", zone: "group" },
  { id: "B2", status: "occupied", zone: "group" },
  { id: "B3", status: "available", zone: "group" },
  { id: "B4", status: "available", zone: "group" },
  { id: "B5", status: "away", zone: "group" },
  { id: "B6", status: "available", zone: "group" },
]

function SeatButton({
  seat,
  selected,
  onSelect,
}: {
  seat: Seat
  selected: boolean
  onSelect: (seatId: string) => void
}) {
  const unavailable = seat.status === "occupied"

  return (
    <button
      data-seat-id={seat.id}
      type="button"
      disabled={unavailable}
      aria-label={`${seat.id} 좌석 ${unavailable ? "사용 중" : seat.status === "away" ? "자리 비움" : "예약 가능"}`}
      aria-pressed={selected}
      onClick={() => onSelect(seat.id)}
      className={cn(
        "relative flex h-12 w-full items-center justify-between border px-3 text-xs font-bold tabular-nums transition-[background-color,border-color,color] duration-150 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-brand",
        selected && "border-brand bg-brand text-black",
        !selected &&
          seat.status === "available" &&
          "border-line bg-white text-ink hover:border-ink",
        !selected &&
          seat.status === "away" &&
          "border-line bg-away text-label hover:border-ink",
        unavailable &&
          "cursor-not-allowed border-transparent bg-disabled/35 text-muted"
      )}
    >
      <span>{seat.id}</span>
      <Monitor aria-hidden="true" className="size-4" strokeWidth={1.8} />
      {seat.status === "away" && (
        <span className="absolute -top-1 -right-1 size-2.5 border-2 border-white bg-warning" />
      )}
    </button>
  )
}

export function App() {
  const [selectedTime, setSelectedTime] = useState("20:00")
  const [selectedSeat, setSelectedSeat] = useState("A3")
  const [notice, setNotice] = useState("")
  const bookingGridRef = useRef<HTMLDivElement>(null)
  const selectedSeatSummaryRef = useRef<HTMLElement>(null)
  const [selectionPath, setSelectionPath] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const quietSeats = seats.filter((seat) => seat.zone === "quiet")
  const groupSeats = seats.filter((seat) => seat.zone === "group")
  const availableCount = seats.filter(
    (seat) => seat.status === "available"
  ).length

  useLayoutEffect(() => {
    const bookingGrid = bookingGridRef.current
    const selectedSeatSummary = selectedSeatSummaryRef.current
    const selectedSeatButton = bookingGrid?.querySelector<HTMLElement>(
      `[data-seat-id="${selectedSeat}"]`
    )

    if (!bookingGrid || !selectedSeatSummary || !selectedSeatButton) return

    const gridElement = bookingGrid
    const summaryElement = selectedSeatSummary
    const seatElement = selectedSeatButton

    function updateSelectionPath() {
      const gridRect = gridElement.getBoundingClientRect()
      const summaryRect = summaryElement.getBoundingClientRect()
      const seatRect = seatElement.getBoundingClientRect()

      setSelectionPath({
        x1: summaryRect.right - gridRect.left + 8,
        y1: summaryRect.top - gridRect.top + summaryRect.height / 2,
        x2: seatRect.left - gridRect.left + seatRect.width / 2,
        y2: seatRect.top - gridRect.top + seatRect.height / 2,
      })
    }

    updateSelectionPath()
    const observer = new ResizeObserver(updateSelectionPath)
    observer.observe(gridElement)
    observer.observe(seatElement)

    return () => observer.disconnect()
  }, [selectedSeat])

  function handleReserve() {
    setNotice(
      `${selectedTime} ${selectedSeat} 좌석을 선택했습니다. 예약 API 연결 전 데모 상태입니다.`
    )
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-10">
          <a
            href="#main"
            className="text-xl font-black tracking-[-0.03em] text-ink"
          >
            코코로<span className="text-brand">.</span>
          </a>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-label">
              <span className="size-2 bg-brand" />
              UI 프로토타입
            </div>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto max-w-[1440px] px-5 py-7 lg:px-10 lg:py-8"
      >
        <div
          ref={bookingGridRef}
          className="relative grid items-start gap-10 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:gap-16"
        >
          {selectionPath && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 hidden size-full overflow-visible lg:block"
            >
              <path
                key={selectedSeat}
                className="selection-connector"
                d={`M ${selectionPath.x1} ${selectionPath.y1} H ${(selectionPath.x1 + selectionPath.x2) / 2} V ${selectionPath.y2} H ${selectionPath.x2}`}
                fill="none"
                stroke="var(--brand)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={selectionPath.x1}
                cy={selectionPath.y1}
                fill="var(--brand)"
                r="4"
              />
              <circle
                cx={selectionPath.x2}
                cy={selectionPath.y2}
                fill="var(--brand)"
                r="4"
              />
            </svg>
          )}
          <section
            className="relative z-10 lg:sticky lg:top-8"
            aria-labelledby="booking-title"
          >
            <Badge
              variant="outline"
              className="mb-4 border-line bg-white text-label"
            >
              오늘 18명 집중 중
            </Badge>
            <h1
              id="booking-title"
              className="max-w-[11ch] text-[clamp(2.4rem,4.4vw,3.7rem)] leading-[0.96] font-black tracking-[-0.04em] text-ink"
            >
              함께 집중할 자리를 골라보세요.
            </h1>
            <p className="mt-4 max-w-[38ch] text-sm leading-5 text-body">
              예약한 좌석에 앉으면 집중 시간이 시작됩니다. 개인 집중석은
              조용하게 이용하고 그룹 테이블에서는 같은 테이블의 사람과 대화할 수
              있습니다.
            </p>

            <div className="mt-6" aria-labelledby="time-label">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="time-label" className="text-sm font-bold text-ink">
                  이용 시간
                </h2>
                <span className="text-xs text-muted">50분 단위</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {timeSlots.map((time) => (
                  <button
                    key={time}
                    type="button"
                    aria-pressed={selectedTime === time}
                    onClick={() => setSelectedTime(time)}
                    className={cn(
                      "h-11 border text-sm font-bold tabular-nums transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                      selectedTime === time
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-white text-label hover:border-ink hover:text-ink"
                    )}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>

            <Separator className="my-5 bg-line" />
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted">선택한 좌석</dt>
                <dd
                  ref={selectedSeatSummaryRef}
                  className="mt-1 text-lg font-black text-ink"
                >
                  {selectedSeat}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">이용 시간</dt>
                <dd className="mt-1 text-lg font-black text-ink tabular-nums">
                  {selectedTime}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">음성</dt>
                <dd className="mt-1 font-bold text-label">
                  {selectedSeat.startsWith("B") ? "같은 테이블" : "사용 안 함"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">카메라</dt>
                <dd className="mt-1 font-bold text-label">선택 사항</dd>
              </div>
            </dl>
            <Button
              size="lg"
              className="mt-5 h-11 w-full justify-between px-5"
              onClick={handleReserve}
            >
              이 자리 선택 <ArrowRight aria-hidden="true" />
            </Button>
            <p
              aria-live="polite"
              className="mt-3 min-h-8 text-xs leading-5 text-body"
            >
              {notice || "예약 확정 전에는 좌석이 저장되지 않습니다."}
            </p>
          </section>

          <section
            id="space"
            aria-labelledby="space-title"
            className="relative z-10 min-w-0"
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-label">
                  <MapPin aria-hidden="true" className="size-3.5" />
                  메인 스터디 카페
                </div>
                <h2
                  id="space-title"
                  className="mt-2 text-2xl font-black tracking-[-0.03em] text-ink"
                >
                  2층 집중 공간
                </h2>
              </div>
              <div className="flex items-center gap-4 text-xs text-label">
                <span>
                  <strong className="text-ink">{availableCount}</strong>석 예약
                  가능
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 bg-warning" />
                  자리 비움
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 bg-disabled" />
                  사용 중
                </span>
              </div>
            </div>

            <div className="floor-plan relative overflow-hidden border border-line bg-floor p-4 sm:p-7 lg:p-10">
              <div className="mb-4 flex items-center justify-between border-b border-ink/15 pb-4">
                <span className="text-xs font-bold tracking-[0.12em] text-label">
                  NORTH WINDOW
                </span>
                <div className="flex gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <Headphones className="size-3.5" />
                    조용한 구역
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Mic2 className="size-3.5" />
                    대화 가능
                  </span>
                </div>
              </div>

              <div
                key={selectedSeat}
                className="selection-rail mb-7 flex items-center gap-3"
                aria-live="polite"
              >
                <span className="h-0.5 flex-1 bg-brand" />
                <span className="bg-ink px-2 py-1 text-[11px] font-black text-white">
                  선택 {selectedSeat}
                </span>
              </div>

              <div className="grid gap-10 xl:grid-cols-[1fr_0.82fr]">
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-black text-ink">개인 집중석</h3>
                    <span className="text-xs text-muted">음성 꺼짐</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                    {quietSeats.map((seat) => (
                      <SeatButton
                        key={seat.id}
                        seat={seat}
                        selected={seat.id === selectedSeat}
                        onSelect={setSelectedSeat}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-black text-ink">그룹 테이블</h3>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Users className="size-3.5" />
                      최대 6명
                    </span>
                  </div>
                  <div className="grid grid-cols-[64px_1fr_64px] gap-3">
                    <div className="grid gap-3">
                      {groupSeats.slice(0, 3).map((seat) => (
                        <SeatButton
                          key={seat.id}
                          seat={seat}
                          selected={seat.id === selectedSeat}
                          onSelect={setSelectedSeat}
                        />
                      ))}
                    </div>
                    <div className="flex min-h-44 items-center justify-center border border-ink/20 bg-table px-3 text-center text-xs leading-5 font-bold text-label">
                      TABLE B<br />
                      같은 테이블 음성
                    </div>
                    <div className="grid gap-3">
                      {groupSeats.slice(3).map((seat) => (
                        <SeatButton
                          key={seat.id}
                          seat={seat}
                          selected={seat.id === selectedSeat}
                          onSelect={setSelectedSeat}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 grid gap-3 border-t border-ink/15 pt-5 sm:grid-cols-3">
                <div className="flex items-center gap-3 bg-white p-4 text-xs text-label shadow-ambient">
                  <Clock3 className="size-4 text-ink" />
                  착석 후 타이머 시작
                </div>
                <div className="flex items-center gap-3 bg-white p-4 text-xs text-label shadow-ambient">
                  <VideoOff className="size-4 text-ink" />
                  카메라 없이 이용 가능
                </div>
                <div className="flex items-center gap-3 bg-white p-4 text-xs text-label shadow-ambient">
                  <Users className="size-4 text-ink" />
                  현재 18명 집중 중
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

export default App
