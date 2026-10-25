import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
