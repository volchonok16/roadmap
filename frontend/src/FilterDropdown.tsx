import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingMenuStyle } from './useFloatingMenu'

export type DropdownOption = {
  value: string
  label: string
  prefix?: string
}

export type DropdownGroup = {
  label: string
  options: DropdownOption[]
}

type FilterDropdownProps = {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  triggerClassName?: string
  options?: DropdownOption[]
  groups?: DropdownGroup[]
  menuMinWidth?: number
}

function flattenOptions(options: DropdownOption[] | undefined, groups: DropdownGroup[] | undefined) {
  if (options?.length) return options
  return (groups ?? []).flatMap((group) => group.options)
}

export default function FilterDropdown({
  value,
  onChange,
  ariaLabel,
  className = '',
  triggerClassName = '',
  options,
  groups,
  menuMinWidth,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const panelStyle = useFloatingMenuStyle(open, rootRef, panelRef, menuMinWidth ?? 280)
  const flat = flattenOptions(options, groups)
  const selected = flat.find((item) => item.value === value)
  const triggerLabel = selected?.label ?? 'Выберите…'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) setFocusIndex(-1)
  }, [open])

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setFocusIndex(Math.max(0, flat.findIndex((item) => item.value === value)))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setFocusIndex(Math.max(0, flat.findIndex((item) => item.value === value)))
    }
  }

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!flat.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocusIndex((prev) => (prev + 1) % flat.length)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusIndex((prev) => (prev <= 0 ? flat.length - 1 : prev - 1))
    }
    if (event.key === 'Enter' && focusIndex >= 0) {
      event.preventDefault()
      pick(flat[focusIndex].value)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  const renderOption = (item: DropdownOption, index: number) => {
    const isSelected = item.value === value
    const isFocused = index === focusIndex
    return (
      <button
        key={item.value}
        type="button"
        role="option"
        aria-selected={isSelected}
        className={`filter-dropdown-option ${isSelected ? 'is-selected' : ''} ${isFocused ? 'is-focused' : ''}`}
        onMouseEnter={() => setFocusIndex(index)}
        onClick={() => pick(item.value)}
      >
        {item.prefix ? <span className="filter-dropdown-prefix">{item.prefix}</span> : null}
        <span className="filter-dropdown-option-label">{item.label}</span>
        {isSelected ? <span className="filter-dropdown-check" aria-hidden>✓</span> : null}
      </button>
    )
  }

  let optionIndex = 0

  return (
    <div className={`filter-dropdown ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`filter-dropdown-trigger ${triggerClassName} ${open ? 'is-open' : ''}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="filter-dropdown-trigger-label">{triggerLabel}</span>
        <span className="filter-dropdown-chevron" aria-hidden />
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={listId}
            ref={panelRef}
            role="listbox"
            className="filter-dropdown-menu floating-menu-portal"
            style={panelStyle}
            onKeyDown={onListKeyDown}
          >
            {options?.map((item) => {
              const node = renderOption(item, optionIndex)
              optionIndex += 1
              return node
            })}
            {groups?.map((group) => (
              <div key={group.label} className="filter-dropdown-group">
                <div className="filter-dropdown-group-label">{group.label}</div>
                {group.options.map((item) => {
                  const node = renderOption(item, optionIndex)
                  optionIndex += 1
                  return node
                })}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
