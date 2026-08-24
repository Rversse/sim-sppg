import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export type AnimatedSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type AnimatedSelectProps = {
  label: string
  value: string
  options: AnimatedSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function AnimatedSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className = ''
}: AnimatedSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listId = useId()
  const triggerId = `${listId}-trigger`

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const enabledIndices = options.reduce<number[]>((indices, option, index) => {
    if (!option.disabled) indices.push(index)
    return indices
  }, [])

  const currentActiveIndex =
    activeIndex >= 0 && !options[activeIndex]?.disabled
      ? activeIndex
      : selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : (enabledIndices[0] ?? -1)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open || currentActiveIndex < 0) return
    optionRefs.current[currentActiveIndex]?.scrollIntoView({
      block: 'nearest'
    })
  }, [open, currentActiveIndex])

  function moveActive(direction: 1 | -1) {
    if (!enabledIndices.length) return

    const currentPosition = Math.max(
      0,
      enabledIndices.indexOf(currentActiveIndex)
    )
    const nextPosition =
      (currentPosition + direction + enabledIndices.length) %
      enabledIndices.length
    setActiveIndex(enabledIndices[nextPosition])
  }

  function choose(index: number) {
    const option = options[index]
    if (!option || option.disabled) return

    onChange(option.value)
    setOpen(false)
    setActiveIndex(index)
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(currentActiveIndex)
      } else {
        moveActive(1)
      }
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(currentActiveIndex)
      } else {
        moveActive(-1)
      }
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()

      if (open && currentActiveIndex >= 0) {
        choose(currentActiveIndex)
      } else {
        setOpen(true)
        setActiveIndex(currentActiveIndex)
      }

      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(enabledIndices[0] ?? -1)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(enabledIndices[enabledIndices.length - 1] ?? -1)
    }
  }

  const composedClassName = [
    'animated-select',
    open ? 'is-open' : '',
    disabled ? 'is-disabled' : '',
    value ? 'has-value' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={composedClassName} ref={rootRef}>
      <button
        id={triggerId}
        type="button"
        className="animated-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current)
          setActiveIndex(currentActiveIndex)
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="animated-select__label">{label}</span>
        <span className="animated-select__value">
          {selectedOption?.label ?? placeholder ?? 'Pilih'}
        </span>
        <svg
          className="animated-select__chevron"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="m7 10 5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>

      <div
        id={listId}
        className="animated-select__menu"
        role="listbox"
        aria-labelledby={triggerId}
        aria-hidden={!open}
      >
        {options.map((option, index) => (
          <button
            key={option.value || `option-${index}`}
            ref={(element) => {
              optionRefs.current[index] = element
            }}
            type="button"
            role="option"
            aria-selected={option.value === value}
            disabled={option.disabled}
            className={`animated-select__option ${
              option.value === value ? 'is-selected' : ''
            } ${index === currentActiveIndex ? 'is-active' : ''}`}
            onMouseEnter={() => {
              if (!option.disabled) setActiveIndex(index)
            }}
            onClick={() => choose(index)}
          >
            <span>{option.label}</span>
            {option.value === value ? (
              <svg
                className="animated-select__check"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="m6 12 4 4 8-8"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
