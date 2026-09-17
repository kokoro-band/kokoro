import { lazy, Suspense, useCallback, useRef, useState } from "react"
import {
  AlertCircle, Armchair, ArrowDownToLine, ArrowLeft, ArrowRight, Box, Check,
  ChevronDown, ChevronRight, CircleHelp, FileImage, FileUp, Flower2,
  Grid2X2, Layers3, LayoutDashboard, LoaderCircle, Maximize2, Move,
  Minus, PanelLeftClose, Plus, Redo2, RefreshCw, RotateCw, Save, Send,
  Settings2, Sofa, Sparkles, Table2, Trash2, Undo2, View,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { catalog, initialMessages, sampleProject } from "@/features/studio/data"
import { createProject, isServerMode, makeFurniture, readSavedProject, saveProject, sendCommand, uploadPlan } from "@/features/studio/project-api"
import type { Category, ChatMessage, Furniture, Project, ViewMode } from "@/features/studio/types"

const categories: Category[] = ["전체", "소파", "테이블", "의자", "장식"]
const money = new Intl.NumberFormat("ko-KR")
const maxFloorPlanBytes = 15 * 1024 * 1024
const supportedFloorPlanTypes = ["application/pdf", "image/png", "image/jpeg"]

type UploadAttempt = {
  file: File
  status: "PROCESSING" | "FAILED"
  phase: "UPLOADING" | "CONVERTING"
  progress: number
  error: string
  retryable: boolean
}
function validateFloorPlan(file: File) {
  if (!supportedFloorPlanTypes.includes(file.type)) return "PDF, PNG, JPG 형식의 도면을 선택해 주세요."
  if (file.size > maxFloorPlanBytes) return "도면 파일은 15MB 이하여야 합니다."
  if (file.size === 0) return "비어 있는 파일은 업로드할 수 없습니다."
  return null
}

const RoomScene = lazy(async () => {
  const module = await import("@/features/studio/RoomScene")
  return { default: module.RoomScene }
})

function FurnitureIcon({ category, size = 28 }: { category: string; size?: number }) {
  if (category === "소파") return <Sofa size={size} strokeWidth={1.5} />
  if (category === "테이블") return <Table2 size={size} strokeWidth={1.5} />
  if (category === "의자") return <Armchair size={size} strokeWidth={1.5} />
  return <Flower2 size={size} strokeWidth={1.5} />
}

export default function App() {
  const [project, setProject] = useState<Project>(readSavedProject)
  const [selectedId, setSelectedId] = useState<string | null>("sofa-01")
  const [mode, setMode] = useState<ViewMode>("3d")
  const [category, setCategory] = useState<Category>("전체")
  const [leftTab, setLeftTab] = useState<"furniture" | "plan">("furniture")
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState<"chat" | "save" | "upload" | "create" | null>(null)
  const [uploadAttempt, setUploadAttempt] = useState<UploadAttempt | null>(null)
  const [past, setPast] = useState<Furniture[][]>([])
  const [future, setFuture] = useState<Furniture[][]>([])
  const [dirty, setDirty] = useState(false)
  const [showLeft, setShowLeft] = useState(true)
  const uploadRef = useRef<HTMLInputElement>(null)
  const newProjectDialogRef = useRef<HTMLDialogElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const selected = project.furniture.find((item) => item.id === selectedId)
  const budget = project.furniture.reduce((total, item) => total + (catalog.find((entry) => entry.id === item.catalogId)?.price ?? 0), 0)
  const displayedFloorPlan = uploadAttempt ? { fileName: uploadAttempt.file.name, size: uploadAttempt.file.size } : project.floorPlan
  const floorPlanStatus = uploadAttempt?.status ?? project.floorPlan.status
  const floorPlanProgress = uploadAttempt?.progress ?? project.floorPlan.progress
  const floorPlanStatusLabel = floorPlanStatus === "PROCESSING"
    ? uploadAttempt?.phase === "UPLOADING" ? "업로드 중" : "변환 중"
    : floorPlanStatus === "READY" ? "예제 모델 준비됨"
      : floorPlanStatus === "FAILED" ? "처리 실패"
        : "도면 대기"
  const floorPlanMessage = floorPlanStatus === "FAILED"
    ? uploadAttempt?.error ?? "도면을 처리하지 못했습니다. 다른 파일을 선택해 주세요."
    : floorPlanStatus === "PROCESSING"
      ? uploadAttempt?.phase === "UPLOADING" ? "도면을 안전하게 업로드하고 있습니다." : "방 치수를 적용하고 있습니다."
      : floorPlanStatus === "READY"
        ? "방을 만들었습니다. 자동 벽 인식은 AI 변환기 연결 후 사용할 수 있습니다."
        : "PDF, PNG, JPG 형식의 15MB 이하 도면을 선택해 주세요."

  function commitFurniture(next: Furniture[]) {
    setPast((history) => [...history.slice(-29), project.furniture])
    setFuture([])
    setProject((current) => ({ ...current, furniture: next }))
    setDirty(true)
  }

  const selectFurniture = useCallback(function selectFurniture(id: string | null) {
    setSelectedId(id)
  }, [])

  const moveFurniture = useCallback(function moveFurniture(id: string, x: number, z: number) {
    setProject((current) => ({ ...current, furniture: current.furniture.map((item) => item.id === id ? { ...item, x, z } : item) }))
    setDirty(true)
  }, [])

  function updateSelected(update: Partial<Furniture>) {
    commitFurniture(project.furniture.map((item) => item.id === selectedId ? { ...item, ...update } : item))
  }

  function addFurniture(catalogId: string) {
    const item = makeFurniture(catalogId, 45 + Math.random() * 15, 40 + Math.random() * 15)
    commitFurniture([...project.furniture, item])
    setSelectedId(item.id)
    setNotice(`${item.name}를 추가했습니다.`)
  }

  function undo() {
    const previous = past.at(-1)
    if (!previous) return
    setFuture((history) => [project.furniture, ...history])
    setPast((history) => history.slice(0, -1))
    setProject((current) => ({ ...current, furniture: previous }))
    setDirty(true)
  }

  function redo() {
    const next = future[0]
    if (!next) return
    setPast((history) => [...history, project.furniture])
    setFuture((history) => history.slice(1))
    setProject((current) => ({ ...current, furniture: next }))
    setDirty(true)
  }

  async function handleSave() {
    setBusy("save")
    try {
      setProject(await saveProject(project))
      setDirty(false)
      setNotice(isServerMode ? "서버에 배치를 저장했습니다." : "이 브라우저에 프로젝트를 저장했습니다.")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "저장하지 못했습니다.")
    } finally {
      setBusy(null)
    }
  }

  async function handleChat(text: string) {
    if (!text.trim() || busy) return
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text }])
    setInput("")
    setBusy("chat")
    try {
      const response = await sendCommand(project, text)
      commitFurniture(response.project.furniture)
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: response.reply }])
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." }])
    } finally {
      setBusy(null)
    }
  }

  async function handleUpload(file?: File) {
    if (!file) return
    setNotice("")
    const validationError = validateFloorPlan(file)
    setLeftTab("plan")
    if (validationError) {
      setUploadAttempt({ file, status: "FAILED", phase: "UPLOADING", progress: 0, error: validationError, retryable: false })
      if (uploadRef.current) uploadRef.current.value = ""
      return
    }

    setBusy("upload")
    setUploadAttempt({ file, status: "PROCESSING", phase: "UPLOADING", progress: 18, error: "", retryable: true })
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350))
      setUploadAttempt((current) => current?.file === file ? { ...current, progress: 42 } : current)
      const uploaded = await uploadPlan(project, file)
      setUploadAttempt((current) => current?.file === file ? { ...current, phase: "CONVERTING", progress: 74 } : current)
      await new Promise((resolve) => window.setTimeout(resolve, 450))
      setProject(uploaded)
      setUploadAttempt(null)
      setDirty(true)
      setNotice("도면을 등록했습니다. 현재 변환기는 예제 방 치수를 사용합니다.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "도면을 등록하지 못했습니다. 다시 시도해 주세요."
      setUploadAttempt((current) => current?.file === file ? { ...current, status: "FAILED", error: message } : current)
    } finally {
      setBusy(null)
      if (uploadRef.current) uploadRef.current.value = ""
    }
  }

  function retryUpload() {
    if (uploadAttempt?.status !== "FAILED" || !uploadAttempt.retryable) return
    void handleUpload(uploadAttempt.file)
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = nameRef.current?.value.trim()
    if (!name) return
    setBusy("create")
    try {
      setProject(await createProject(name))
      setSelectedId(null)
      setPast([])
      setFuture([])
      setMessages(initialMessages)
      setUploadAttempt(null)
      setLeftTab("plan")
      setDirty(true)
      newProjectDialogRef.current?.close()
      setNotice("새 프로젝트를 만들었습니다. 도면을 업로드해 주세요.")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "프로젝트를 만들지 못했습니다.")
    } finally {
      setBusy(null)
    }
  }

  function exportProject() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${project.name}-layout.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice("배치 데이터를 JSON 파일로 내보냈습니다.")
  }

  return (
    <div className="studio-app">
      <header className="app-header">
        <a className="brand" href="#workspace" aria-label="코코로 스튜디오"><span className="brand-mark"><Box size={20} /></span>kokoro<span className="brand-word">studio</span></a>
        <nav className="header-nav" aria-label="주 메뉴"><a className="active" href="#workspace">내 공간</a><button onClick={() => newProjectDialogRef.current?.showModal()}>새 프로젝트</button></nav>
        <div className="header-right"><span className="mode-label"><span />{isServerMode ? "서버 연결 모드" : "로컬 데모"}</span><button className="avatar" title="현재는 로그인 없는 데모입니다">K</button></div>
      </header>

      <main id="workspace" className="workspace">
        <div className="project-bar">
          <div className="project-heading"><button className="icon-button back-button" aria-label="예제 프로젝트 열기" onClick={() => { setProject(structuredClone(sampleProject)); setUploadAttempt(null); setDirty(true); setNotice("예제 프로젝트를 열었습니다.") }}><ArrowLeft size={18} /></button><div><div className="breadcrumb">내 공간 <ChevronRight size={12} /> 리모델링 프로젝트</div><h1>{project.name}<ChevronDown size={16} /></h1></div><Badge className="project-badge" variant="outline">{project.roomType}</Badge></div>
          <div className="project-actions"><span className="save-status">{dirty ? "저장하지 않은 변경" : "모든 변경 저장됨"}</span><Button variant="outline" className="export-button" onClick={exportProject}><ArrowDownToLine size={16} />내보내기</Button><Button className="save-button" onClick={handleSave} disabled={busy !== null}>{busy === "save" ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}저장</Button></div>
        </div>

        <div className={`editor-grid ${!showLeft ? "left-hidden" : ""}`}>
          {showLeft && <aside className="library-panel">
            <div className="panel-tabs" role="tablist" aria-label="소스 선택"><button role="tab" aria-selected={leftTab === "furniture"} className={leftTab === "furniture" ? "active" : ""} onClick={() => setLeftTab("furniture")}><Armchair size={16} />가구 라이브러리</button><button role="tab" aria-selected={leftTab === "plan"} className={leftTab === "plan" ? "active" : ""} onClick={() => setLeftTab("plan")}><Layers3 size={16} />도면</button></div>
            {leftTab === "furniture" ? <>
              <div className="library-heading"><h2>공간에 더할 것들</h2><p>가구를 선택해 방에 배치해 보세요.</p></div>
              <div className="category-list" aria-label="가구 종류">{categories.map((entry) => <button key={entry} className={category === entry ? "active" : ""} aria-pressed={category === entry} onClick={() => setCategory(entry)}>{entry}</button>)}</div>
              <div className="catalog-grid">{catalog.filter((item) => category === "전체" || item.category === category).map((item) => <button className="catalog-card" key={item.id} onClick={() => addFurniture(item.id)}><div className="catalog-visual" style={{ "--item-color": item.color } as React.CSSProperties}><FurnitureIcon category={item.category} size={46} /><span className="add-icon"><Plus size={14} /></span></div><strong>{item.name}</strong><span>{item.description}</span><div className="catalog-meta"><span>{Math.round(item.width * 100)} × {Math.round(item.depth * 100)} cm</span><b>₩{money.format(item.price)}</b></div></button>)}</div>
              <div className="library-footnote"><Box size={14} /><span>규격 기반 기본 모델입니다.<br />실제 제품 모델은 추후 연결됩니다.</span></div>
            </> : <div className="plan-panel">
              <div className="library-heading"><h2>도면에서 시작하기</h2><p>평면도를 올리고 내 공간의 뼈대를 만드세요.</p></div>
              <button className="upload-zone" onClick={() => uploadRef.current?.click()} disabled={busy !== null}><span className="upload-icon"><FileUp size={26} /></span><strong>{floorPlanStatus === "FAILED" ? "다른 도면 선택" : "도면 업로드"}</strong><span>PDF, PNG, JPG 형식, 최대 15MB</span></button>
              {displayedFloorPlan.fileName && <div className={`uploaded-file ${floorPlanStatus.toLowerCase()}`}><FileImage size={20} /><div><strong>{displayedFloorPlan.fileName}</strong><span>{(displayedFloorPlan.size / 1024).toFixed(0)} KB</span></div>{floorPlanStatus === "PROCESSING" ? <LoaderCircle className="spin" size={16} /> : floorPlanStatus === "FAILED" ? <AlertCircle size={16} /> : <Check size={16} />}</div>}
              <div className={`conversion-card ${floorPlanStatus.toLowerCase()}`} aria-live="polite">
                <div><span className="small-label">3D 변환</span><Badge variant="outline">{floorPlanStatusLabel}</Badge></div>
                <div className="progress-track" role="progressbar" aria-label="도면 처리 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={floorPlanProgress}><span style={{ width: `${floorPlanProgress}%` }} /></div>
                <p role={floorPlanStatus === "FAILED" ? "alert" : undefined}>{floorPlanMessage}</p>
                {floorPlanStatus === "FAILED" && uploadAttempt?.retryable && <Button type="button" variant="outline" className="retry-upload" onClick={retryUpload} disabled={busy !== null}><RefreshCw size={14} />같은 파일 다시 시도</Button>}
              </div>
              <h3>공간 치수</h3>
              <div className="room-dimensions">{Object.entries(project.dimensions).map(([key, value]) => <div key={key}><span>{key === "width" ? "가로" : key === "depth" ? "세로" : "높이"}</span><strong>{value.toFixed(1)}<small>m</small></strong></div>)}</div>
              <div className="tip-card"><CircleHelp size={17} /><p>치수가 표기된 도면을 사용하면 실제 공간에 가까운 모델을 만들 수 있습니다.</p></div>
            </div>}
          </aside>}

          <section className="scene-panel" aria-label="공간 편집">
            <div className="scene-toolbar"><div className="toolbar-left"><button className="icon-button" aria-label={showLeft ? "라이브러리 접기" : "라이브러리 열기"} onClick={() => setShowLeft(!showLeft)}><PanelLeftClose size={17} /></button><span className="toolbar-divider" /><div className="view-switch" aria-label="웹 보기 방식">{([{ id: "2d", label: "2D", icon: Grid2X2 }, { id: "3d", label: "3D", icon: Box }, { id: "vr", label: "웹 VR", icon: View }] as const).map((view) => <button key={view.id} aria-pressed={mode === view.id} className={mode === view.id ? "active" : ""} onClick={() => setMode(view.id)}><view.icon size={15} />{view.label}</button>)}</div></div><div className="toolbar-right"><button className="icon-button" aria-label="실행 취소" disabled={!past.length} onClick={undo}><Undo2 size={17} /></button><button className="icon-button" aria-label="다시 실행" disabled={!future.length} onClick={redo}><Redo2 size={17} /></button><span className="toolbar-divider" /><button className="icon-button" aria-label="편집 영역 전체 화면" onClick={() => document.querySelector(".scene-panel")?.requestFullscreen().catch(() => setNotice("전체 화면을 시작하지 못했습니다."))}><Maximize2 size={16} /></button></div></div>
            <div className="scene-area"><div className="scene-caption"><span className="scene-dot" /><span>{mode === "vr" ? "같은 웹에서 VR로 확인하는 중" : mode === "2d" ? "위에서 보는 2D 배치" : "브라우저 3D로 꾸미는 중"}</span></div><Suspense fallback={<div className="scene-loading"><LoaderCircle className="spin" size={20} />3D 공간을 준비하고 있어요</div>}><RoomScene furniture={project.furniture} selectedId={selectedId} mode={mode} onSelect={selectFurniture} onMove={moveFurniture} /></Suspense><div className="scene-scale"><span />1 m</div><div className="scene-hint"><Move size={14} /><span>{mode === "vr" ? "헤드셋에서 가구를 집고 바닥을 가리켜 놓으세요" : "가구를 드래그하면 이동합니다. 빈 공간을 드래그하면 회전하고 스크롤하면 확대합니다."}</span></div>{mode === "vr" && <div className="vr-information"><View size={20} /><strong>앱 설치 없이 웹에서 들어가세요</strong><p>WebXR 지원 헤드셋과 HTTPS 연결이 필요합니다. 아래 웹 VR 버튼에서 이 기기의 지원 여부를 확인할 수 있습니다.</p></div>}</div>
            <div className="scene-bottom"><div><Layers3 size={16} /><strong>{project.furniture.length}개의 가구</strong><span className="bottom-divider" /><span>{(project.dimensions.width * project.dimensions.depth).toFixed(1)} m²</span></div><span className="scene-note">배치 기준 모델</span></div>
            <div className="layout-summary"><div className="summary-icon"><LayoutDashboard size={21} /></div><div><strong>지금의 공간 계획</strong><p>가구를 바꾸고 위치를 조절하며 가장 편한 배치를 찾아보세요.</p></div><div className="budget"><span>가구 예상 금액</span><strong>₩{money.format(budget)}</strong></div></div>
          </section>

          <aside className="assistant-panel"><div className="assistant-heading"><div className="assistant-symbol"><Sparkles size={20} /></div><div><h2>공간 어시스턴트</h2><span>말로 시작하고 손으로 완성해요</span></div><button className="icon-button" title="현재는 규칙 기반 배치 데모입니다" aria-label="어시스턴트 정보"><CircleHelp size={16} /></button></div><div className="chat-messages" aria-live="polite">{messages.map((message) => <div key={message.id} className={`chat-message ${message.role}`}>{message.role === "assistant" && <span className="chat-avatar"><Sparkles size={13} /></span>}<p>{message.text}</p></div>)}{busy === "chat" && <div className="chat-pending"><LoaderCircle size={15} className="spin" />배치를 생각하고 있어요</div>}</div><div className="prompt-suggestions">{["미니멀한 거실로 꾸며줘", "창가에 의자를 옮겨줘"].map((text) => <button key={text} onClick={() => handleChat(text)} disabled={busy !== null}>{text}<ArrowRight size={12} /></button>)}</div><form className="chat-form" onSubmit={(event) => { event.preventDefault(); void handleChat(input) }}><label className="sr-only" htmlFor="chat-input">가구 배치 요청</label><textarea id="chat-input" rows={2} value={input} onChange={(event) => setInput(event.target.value)} placeholder="예: 소파 옆에 화분을 놓아줘" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleChat(input) } }} /><div><span><Sparkles size={12} />{isServerMode ? "Spring 배치 처리기" : "규칙 기반 배치 데모"}</span><button type="submit" aria-label="배치 요청 보내기" disabled={!input.trim() || busy !== null}><Send size={16} /></button></div></form>
            <div className="properties"><div className="properties-heading"><h3><Settings2 size={16} />선택한 가구</h3>{selected && <button className="icon-button danger" aria-label="선택한 가구 삭제" onClick={() => { commitFurniture(project.furniture.filter((item) => item.id !== selectedId)); setSelectedId(null) }}><Trash2 size={16} /></button>}</div>{selected ? <><div className="selected-item"><span style={{ color: selected.color }}><FurnitureIcon category={selected.category} size={28} /></span><div><strong>{selected.name}</strong><span>{selected.category}</span></div></div><div className="position-fields"><label>가로 위치<input type="number" min={7} max={93} value={Math.round(selected.x)} onChange={(event) => updateSelected({ x: Math.min(93, Math.max(7, Number(event.target.value))) })} /><span>%</span></label><label>세로 위치<input type="number" min={8} max={92} value={Math.round(selected.z)} onChange={(event) => updateSelected({ z: Math.min(92, Math.max(8, Number(event.target.value))) })} /><span>%</span></label></div><div className="rotation-control"><span>회전</span><button className="icon-button" aria-label="15도 왼쪽 회전" onClick={() => updateSelected({ rotation: (selected.rotation - 15 + 360) % 360 })}><Minus size={14} /></button><strong>{selected.rotation}°</strong><button className="icon-button" aria-label="15도 오른쪽 회전" onClick={() => updateSelected({ rotation: (selected.rotation + 15) % 360 })}><Plus size={14} /></button><button className="icon-button" aria-label="회전 초기화" onClick={() => updateSelected({ rotation: 0 })}><RotateCw size={14} /></button></div></> : <div className="selection-empty"><Move size={24} /><p>공간에서 가구를 선택하면<br />위치와 회전을 조절할 수 있어요.</p></div>}</div>
          </aside>
        </div>
      </main>
      <footer className="app-footer"><span><Check size={13} />도면과 배치 데이터를 하나의 프로젝트로</span><span>코코로 리모델링 스튜디오</span></footer>
      <div className={`notice ${notice ? "visible" : ""}`} role="status">{notice}<button aria-label="알림 닫기" onClick={() => setNotice("")}>×</button></div>
      <input ref={uploadRef} className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => void handleUpload(event.target.files?.[0])} />
      <dialog ref={newProjectDialogRef} className="new-project-dialog"><form onSubmit={handleCreate}><span className="dialog-icon"><Box size={26} /></span><h2>새로운 공간을 시작해요</h2><p>프로젝트 이름을 정한 뒤 도면을 업로드하세요.</p><label htmlFor="project-name">프로젝트 이름</label><input ref={nameRef} id="project-name" placeholder="예: 우리 집 거실" required maxLength={60} /><div><Button type="button" variant="outline" onClick={() => newProjectDialogRef.current?.close()}>취소</Button><Button type="submit" disabled={busy !== null}>프로젝트 만들기 <ArrowRight size={16} /></Button></div></form></dialog>
    </div>
  )
}
