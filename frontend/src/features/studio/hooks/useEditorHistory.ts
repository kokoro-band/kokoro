import { useCallback, useRef, useState } from "react"

type History<T> = { past: T[]; present: T; future: T[] }

const historyLimit = 50
const mergeWindowMs = 700

export function useEditorHistory<T>(initial: () => T) {
  const [history, setHistory] = useState<History<T>>(() => ({
    past: [],
    present: initial(),
    future: [],
  }))
  const pending = useRef(false)
  const lastTag = useRef<{ tag: string; at: number } | null>(null)

  const apply = useCallback((updater: (current: T) => T, push: boolean) => {
    setHistory((current) => {
      const next = updater(current.present)
      if (Object.is(next, current.present)) return current
      if (!push) return { ...current, present: next }
      return {
        past: [...current.past, current.present].slice(-historyLimit),
        present: next,
        future: [],
      }
    })
  }, [])

  const set = useCallback(
    (updater: (current: T) => T, tag?: string) => {
      const now = Date.now()
      const merge =
        tag !== undefined &&
        lastTag.current?.tag === tag &&
        now - lastTag.current.at < mergeWindowMs
      lastTag.current = tag === undefined ? null : { tag, at: now }
      apply(updater, !merge)
    },
    [apply]
  )

  const mark = useCallback(() => {
    pending.current = true
  }, [])

  const replace = useCallback(
    (updater: (current: T) => T) => {
      const push = pending.current
      pending.current = false
      lastTag.current = null
      apply(updater, push)
    },
    [apply]
  )

  const reset = useCallback((value: T) => {
    pending.current = false
    lastTag.current = null
    setHistory((current) => ({
      past: [...current.past, current.present].slice(-historyLimit),
      present: value,
      future: [],
    }))
  }, [])

  const undo = useCallback(() => {
    lastTag.current = null
    setHistory((current) => {
      if (!current.past.length) return current
      return {
        past: current.past.slice(0, -1),
        present: current.past[current.past.length - 1],
        future: [current.present, ...current.future],
      }
    })
  }, [])

  const redo = useCallback(() => {
    lastTag.current = null
    setHistory((current) => {
      if (!current.future.length) return current
      return {
        past: [...current.past, current.present],
        present: current.future[0],
        future: current.future.slice(1),
      }
    })
  }, [])

  return {
    present: history.present,
    set,
    mark,
    replace,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }
}
