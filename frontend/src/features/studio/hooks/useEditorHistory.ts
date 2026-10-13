import { useCallback, useState } from "react"

type History<T> = {
  past: T[]
  present: T
  future: T[]
  pending: boolean
  lastTag: { tag: string; at: number } | null
}

const historyLimit = 50
const mergeWindowMs = 700

export function useEditorHistory<T>(initial: () => T) {
  const [history, setHistory] = useState<History<T>>(() => ({
    past: [],
    present: initial(),
    future: [],
    pending: false,
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
        pending: false,
        lastTag: tag === undefined ? null : { tag, at: now },
      }
    })
  }, [])

  const mark = useCallback(() => {
    setHistory((current) => ({ ...current, pending: true, lastTag: null }))
  }, [])

  const replace = useCallback((updater: (current: T) => T) => {
    setHistory((current) => {
      const next = updater(current.present)
      if (Object.is(next, current.present)) return current
      return {
        past: current.pending
          ? [...current.past, current.present].slice(-historyLimit)
          : current.past,
        present: next,
        future: [],
        pending: false,
        lastTag: null,
      }
    })
  }, [])

  const reset = useCallback((value: T) => {
    setHistory((current) => ({
      past: [...current.past, current.present].slice(-historyLimit),
      present: value,
      future: [],
      pending: false,
      lastTag: null,
    }))
  }, [])

  const undo = useCallback(() => {
    setHistory((current) => {
      if (!current.past.length)
        return { ...current, pending: false, lastTag: null }
      return {
        past: current.past.slice(0, -1),
        present: current.past[current.past.length - 1],
        future: [current.present, ...current.future],
        pending: false,
        lastTag: null,
      }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory((current) => {
      if (!current.future.length)
        return { ...current, pending: false, lastTag: null }
      return {
        past: [...current.past, current.present],
        present: current.future[0],
        future: current.future.slice(1),
        pending: false,
        lastTag: null,
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
