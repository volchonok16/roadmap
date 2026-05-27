import { useState, type MouseEvent } from 'react'

type TagChipsProps = {
  tags: string[]
  className?: string
  maxVisible?: number
  variant?: 'default' | 'bar'
}

export default function TagChips({ tags, className = '', maxVisible = 6, variant = 'default' }: TagChipsProps) {
  const [expanded, setExpanded] = useState(false)
  const normalized = tags.map((tag) => tag.trim()).filter(Boolean)
  if (!normalized.length) return null

  const canCollapse = variant === 'bar' && normalized.length > maxVisible
  const visible = expanded || !canCollapse ? normalized : normalized.slice(0, maxVisible)
  const hiddenCount = canCollapse && !expanded ? normalized.length - maxVisible : 0
  const rowClass = variant === 'bar' ? 'bar-tag-footer' : 'item-tag-row'
  const chipClass = variant === 'bar' ? 'bar-tag-chip' : 'item-tag-chip'

  const stop = (event: MouseEvent) => {
    event.stopPropagation()
  }

  return (
    <div className={`${rowClass} ${expanded ? 'is-expanded' : ''} ${className}`.trim()} onClick={stop}>
      {visible.map((tag) => (
        <span key={tag} className={chipClass} title={tag}>
          {tag}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className={variant === 'bar' ? 'bar-tag-more' : 'item-tag-more'}
          title={`Показать ещё ${hiddenCount}: ${normalized.slice(maxVisible).join(', ')}`}
          aria-expanded={false}
          onClick={(event) => {
            stop(event)
            setExpanded(true)
          }}
        >
          +{hiddenCount}
        </button>
      ) : null}
      {expanded && canCollapse ? (
        <button
          type="button"
          className="bar-tag-collapse"
          title="Свернуть теги"
          aria-expanded
          onClick={(event) => {
            stop(event)
            setExpanded(false)
          }}
        >
          −
        </button>
      ) : null}
    </div>
  )
}
