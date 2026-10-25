import { screen } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

export async function openAgent(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('link', { name: 'AI Agents' }))
  await user.click(await screen.findByRole('link', { name }))
  await screen.findByRole('heading', { level: 1, name: new RegExp(`^${name}`) })
}
