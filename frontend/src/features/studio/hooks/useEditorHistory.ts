import { useCallback, useState } from "react"

type History<T> = {
  past: T[]
  present: T
  future: T[]
  lastTag: { tag: string; at: number } | null
}

const historyLimit = 50
const mergeWindowMs = 700

export function useEditorHistory<T>(initial: () => T) {
  const [history, setHistory] = useState<History<T>>(() => ({
    past: [],
    present: initial(),
    future: [],
    lastTag: null,
  }))

  const set = useCallback((updater: (current: T) => T, tag?: string) => {
    const now = Date.now()
    setHistory((current) => {
      const next = updater(current.present)
      if (Object.is(next, current.present)) return current
      const merge =
        tag !== undefined &&
        current.lastTag?.tag === tag &&
        now - current.lastTag.at < mergeWindowMs
      return {
        past: merge
          ? current.past
          : [...current.past, current.present].slice(-historyLimit),
        present: next,
        future: [],
        lastTag: tag === undefined ? null : { tag, at: now },
      }
    })
  }, [])

  const reset = useCallback((value: T) => {
    setHistory((current) => ({
      past: [...current.past, current.present].slice(-historyLimit),
      present: value,
      future: [],
      lastTag: null,
    }))
  }, [])

  const undo = useCallback(() => {
    setHistory((current) => {
      if (!current.past.length) return { ...current, lastTag: null }
      return {
        past: current.past.slice(0, -1),
        present: current.past[current.past.length - 1],
        future: [current.present, ...current.future],
        lastTag: null,
      }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory((current) => {
      if (!current.future.length) return { ...current, lastTag: null }
      return {
        past: [...current.past, current.present],
        present: current.future[0],
        future: current.future.slice(1),
        lastTag: null,
      }
    })
  }, [])

  return {
    present: history.present,
    set,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }
}
