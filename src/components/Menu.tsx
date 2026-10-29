import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  id: string
  label: string
  description?: string
  onSelect?: () => void
  disabled?: boolean
  /** Renders as a menuitemradio with this checked state. */
  checked?: boolean
  separatorBefore?: boolean
  icon?: ReactNode
}

interface MenuProps {
  label: string
  button: ReactNode
  buttonClassName?: string
  items: MenuItem[]
  align?: 'start' | 'end'
  onOpen?: () => void
}

/** Menu button following the WAI-ARIA menu pattern (arrows, Home/End, Escape, Tab). */
export function Menu({ label, button, buttonClassName = 'icon-button', items, align = 'end', onOpen }: MenuProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const itemNodes = () => [...(listRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    itemNodes().find((n) => n.getAttribute('aria-disabled') !== 'true')?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!listRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const activate = (item: MenuItem) => {
    if (item.disabled) return
    close(false)
    // Return focus to the trigger first so dialogs opened by onSelect restore to it.
    buttonRef.current?.focus()
    item.onSelect?.()
  }

  const onListKey = (e: React.KeyboardEvent) => {
    const nodes = itemNodes()
    const idx = nodes.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => nodes[(to + nodes.length) % nodes.length]?.focus()
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(idx + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(idx - 1)
        break
      case 'Home':
        e.preventDefault()
        move(0)
        break
      case 'End':
        e.preventDefault()
        move(nodes.length - 1)
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        close()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className="menu-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen(!open)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            onOpen?.()
            setOpen(true)
          }
        }}
      >
        {button}
      </button>
      {open && (
        <div ref={listRef} id={menuId} role="menu" aria-label={label} className={`menu menu-${align}`} onKeyDown={onListKey}>
          {items.map((item) => (
            <div key={item.id}>
              {item.separatorBefore && <div role="separator" className="menu-separator" />}
              <div
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                aria-disabled={item.disabled || undefined}
                tabIndex={-1}
                className="menu-item"
                onClick={() => activate(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    activate(item)
                  }
                }}
              >
                <span className="menu-check" aria-hidden="true">
                  {item.icon ?? (item.checked ? '✓' : '')}
                </span>
                <span>
                  <span className="menu-label">{item.label}</span>
                  {item.description && <span className="menu-desc">{item.description}</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
