import { groupAgents } from '../agents'
import type { AgentCategoryId, AgentDefinition } from '../agents'
import { Icon } from './Icon'

export function AgentLibrary({
  category,
  available,
}: {
  category?: AgentCategoryId
  available?: readonly AgentDefinition[]
}) {
  const groups = groupAgents(available).filter((group) => !category || group.id === category)
  return (
    <div className="agent-library">
      <div className="library-intro">
        <div className="library-intro-icon">
          <Icon name="sparkle" size={27} />
        </div>
        <div>
          <h2>Een specialist voor je document.</h2>
          <p>Kies een agent die past bij je vraag. Je opent direct de bijbehorende werkruimte.</p>
        </div>
      </div>
      {groups.map((group) => (
        <section
          className="library-category"
          key={group.id}
          aria-labelledby={`category-${group.id}`}
        >
          <div className="library-category-heading">
            <span className="category-icon">
              <Icon name={group.icon} size={21} />
            </span>
            <div>
              <h2 id={`category-${group.id}`}>{group.name}</h2>
              <p>{group.description}</p>
            </div>
          </div>
          <div className="agent-grid">
            {group.agents.map((agent) => (
              <a
                key={agent.id}
                href={`#/agents/${agent.id}`}
                className="agent-card"
                aria-labelledby={`agent-${agent.id}`}
                aria-describedby={`description-${agent.id}`}
              >
                <span className="agent-card-icon">
                  <Icon name={agent.icon} size={23} />
                </span>
                <div className="agent-card-content">
                  <span className="agent-category-tag">{group.name}</span>
                  <h3 id={`agent-${agent.id}`}>{agent.name}</h3>
                  <p id={`description-${agent.id}`}>{agent.description}</p>
                </div>
                <span className="agent-card-action">
                  Agent openen <Icon name="chevron" size={16} />
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
