import { memo, useCallback, useEffect, useState } from 'react'
import type { ClipboardEvent, FormEvent, KeyboardEvent } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, UserPlus, X } from 'lucide-react'
import type { Person } from '../lib/types'
import { Button, Panel } from './ui'
import { cn } from '../lib/utils'

interface PeopleEditorProps {
  people: Person[]
  /** 결과가 공개된 뒤 당첨자에게 표시를 남긴다. */
  winnerIds: Set<string>
  disabled: boolean
  onAdd: (raw: string) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onReorder: (from: number, to: number) => void
  onClear: () => void
}

function PeopleEditorImpl({
  people,
  winnerIds,
  disabled,
  onAdd,
  onRename,
  onRemove,
  onReorder,
  onClear,
}: PeopleEditorProps) {
  const [draft, setDraft] = useState('')

  const sensors = useSensors(
    // 6px 이상 움직여야 드래그로 인정한다. 그래야 손잡이를 그냥 눌렀을 때
    // 클릭으로 처리되고, 모바일에서 스크롤과도 싸우지 않는다.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      onAdd(draft)
      setDraft('')
    },
    [draft, onAdd],
  )

  /** 여러 줄을 붙여넣으면 입력창을 거치지 않고 곧바로 한 줄씩 추가한다. */
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      const text = event.clipboardData.getData('text')
      if (!/[\n\r]/.test(text)) return
      event.preventDefault()
      onAdd(text)
      setDraft('')
    },
    [onAdd],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const from = people.findIndex((p) => p.id === active.id)
      const to = people.findIndex((p) => p.id === over.id)
      if (from !== -1 && to !== -1) onReorder(from, to)
    },
    [onReorder, people],
  )

  return (
    <Panel>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          명단
          <span className="ml-1.5 text-neutral-400 tabular-nums">{people.length}명</span>
        </h2>
        {people.length > 0 && (
          <Button
            variant="ghost"
            onClick={onClear}
            disabled={disabled}
            className="px-2 py-1 text-xs"
          >
            <Trash2 className="size-3.5" aria-hidden />
            명단 비우기
          </Button>
        )}
      </header>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder="이름 입력 후 Enter"
          aria-label="추가할 이름"
          className={cn(
            'min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm',
            'placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none',
            'disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100',
          )}
        />
        <Button type="submit" variant="primary" disabled={disabled || !draft.trim()}>
          <UserPlus className="size-4" aria-hidden />
          추가
        </Button>
      </form>

      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        여러 줄을 한꺼번에 붙여넣으면 한 줄에 한 명씩 자동으로 추가됩니다.
      </p>

      {people.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={people} strategy={verticalListSortingStrategy}>
            <ul className="mt-3 flex flex-col gap-1">
              {people.map((person, index) => (
                <SortableRow
                  key={person.id}
                  person={person}
                  order={index + 1}
                  won={winnerIds.has(person.id)}
                  disabled={disabled}
                  onRename={onRename}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </Panel>
  )
}

interface SortableRowProps {
  person: Person
  order: number
  won: boolean
  disabled: boolean
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
}

function SortableRow({
  person,
  order,
  won,
  disabled,
  onRename,
  onRemove,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: person.id, disabled })

  // 입력 중에는 화면 값을 로컬로 들고 있다가, 편집이 끝날 때만 상위로 올린다.
  const [value, setValue] = useState(person.name)
  useEffect(() => setValue(person.name), [person.name])

  const commit = () => {
    onRename(person.id, value)
    // 중복·빈 이름이라 거절당했을 수 있으므로 화면 값을 원본으로 되돌린다.
    // 반영됐다면 위의 effect가 새 이름으로 다시 맞춰 준다.
    setValue(person.name)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setValue(person.name)
      event.currentTarget.blur()
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1 rounded-xl border border-transparent bg-neutral-100 pr-1 pl-1',
        'dark:bg-neutral-800/60',
        isDragging && 'z-10 border-amber-500 shadow-lg',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`${person.name} 순서 바꾸기`}
        className="shrink-0 cursor-grab touch-none rounded-lg p-1.5 text-neutral-400 hover:text-neutral-700 active:cursor-grabbing disabled:cursor-not-allowed dark:hover:text-neutral-200"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <span className="w-5 shrink-0 text-center text-xs text-neutral-400 tabular-nums">
        {order}
      </span>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={`${person.name} 이름`}
        className={cn(
          'min-w-0 flex-1 rounded-lg bg-transparent px-1 py-2 text-sm text-neutral-800',
          'focus:bg-white focus:outline-2 focus:outline-amber-500',
          'dark:text-neutral-100 dark:focus:bg-neutral-950',
          won && 'font-bold text-amber-600 dark:text-amber-400',
        )}
      />

      <button
        type="button"
        onClick={() => onRemove(person.id)}
        disabled={disabled}
        aria-label={`${person.name} 삭제`}
        className="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  )
}

export const PeopleEditor = memo(PeopleEditorImpl)
