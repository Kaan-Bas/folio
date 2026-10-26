import { useState } from 'react'
import { agents, groupAgents } from '../agents'
import { routeHref } from '../navigation'
import type { AppRoute } from '../navigation'
import { Icon } from './Icon'

export function AppNavigation({ route }: { route: AppRoute }) {
  const [open, setOpen] = useState(false)
  const activeAgent = route.view === 'agent' ? agents.find((a) => a.id === route.agentId) : null
  const activeCategory = route.view === 'library' ? route.category : activeAgent?.category

  return (
    <aside className="app-navigation">
      <div className="mobile-navigation-bar">
        <span>{route.view === 'chat' ? 'Document Chat' : 'AI Agents'}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="navigation-links"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'close' : 'menu'} size={19} />
          {open ? 'Navigatie sluiten' : 'Navigatie openen'}
        </button>
      </div>
      <div id="navigation-links" className="navigation-links" data-open={open}>
        <span className="navigation-eyebrow">WERKRUIMTE</span>
        <nav aria-label="Hoofdnavigatie" onClick={() => setOpen(false)}>
          <ul className="navigation-list" aria-label="Hoofdonderdelen">
            <li>
              <a
                href={routeHref({ view: 'chat' })}
                className="navigation-link"
                aria-current={route.view === 'chat' ? 'page' : undefined}
                data-active={route.view === 'chat'}
              >
                <Icon name="chat" size={19} />
                Document Chat
              </a>
            </li>
            <li>
              <a
                href={routeHref({ view: 'library' })}
                className="navigation-link"
                aria-current={
                  route.view === 'chat'
                    ? undefined
                    : route.view === 'library' && !route.category
                      ? 'page'
                      : 'location'
                }
                data-active={route.view !== 'chat'}
              >
                <Icon name="grid" size={19} />
                AI Agents
              </a>
              <nav className="agent-subnavigation" aria-label="Agentcategorieën">
                {groupAgents().map((category) => (
                  <a
                    key={category.id}
                    href={routeHref({ view: 'library', category: category.id })}
                    className="navigation-link category-link"
                    aria-current={
                      activeCategory === category.id
                        ? route.view === 'agent'
                          ? 'location'
                          : 'page'
                        : undefined
                    }
                  >
                    <Icon name={category.icon} size={17} />
                    <span>{category.name}</span>
                  </a>
                ))}
              </nav>
            </li>
          </ul>
        </nav>
        <div className="navigation-note">
          <Icon name="book" size={18} />
          <p>Van document naar inzicht. Met de bron erbij.</p>
        </div>
      </div>
    </aside>
  )
}
