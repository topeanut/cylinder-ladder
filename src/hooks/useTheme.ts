import { useCallback, useEffect, useState } from 'react'
import type { Theme } from '../lib/types'
import { THEME_KEY, readRaw, writeRaw } from '../lib/storage'

function initialTheme(): Theme {
  const saved = readRaw(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  // index.html의 인라인 스크립트가 이미 시스템 설정을 반영해 두었다.
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    writeRaw(THEME_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme }
}
