import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  labelledBy: string
  describedBy?: string
  role?: 'dialog' | 'alertdialog'
  /** Called on Escape. Omit to ignore Escape (e.g. while applying). */
  onEscape?: () => void
  /** Changing this moves focus to the new content's [data-autofocus] or heading. */
  focusKey?: string
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

/** Modal dialog with focus trap, Escape handling and focus restore. */
export function Modal({
  labelledBy,
  describedBy,
  role = 'dialog',
  onEscape,
  focusKey,
  size = 'md',
  children,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const escapeRef = useRef(onEscape)
  useLayoutEffect(() => {
    escapeRef.current = onEscape
  })

  // Captured during the first render, before this dialog moves focus.
  const [opener] = useState(() => document.activeElement as HTMLElement | null)

  useEffect(() => {
    const node = ref.current
    return () => {
      // Passive cleanup runs after DOM removal; a still-connected node means a
      // StrictMode re-run, not a real close.
      if (node?.isConnected) return
      if (opener?.isConnected) return opener.focus()
      // The opener may be gone (e.g. a file that moved); fall back to the page heading,
      // unless an enclosing dialog's cleanup already restored focus somewhere live.
      const active = document.activeElement
      if (!active || active === document.body) document.getElementById('page-heading')?.focus()
    }
  }, [opener])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('h2')
    target?.focus()
  }, [focusKey])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      escapeRef.current?.()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    e.stopPropagation()
    const nodes = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
    if (!nodes.length) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !ref.current.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !ref.current.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="scrim" onKeyDown={onKeyDown}>
      <div
        ref={ref}
        className={`dialog dialog-${size}`}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        {children}
      </div>
    </div>
  )
}
