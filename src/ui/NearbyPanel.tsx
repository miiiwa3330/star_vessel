import { hudActions, type NearbySection } from './hud-store';

/** 近くの天体の一覧（要件 F35）。選ぶと、その天体に印が付き、情報のカードが出る */
export function NearbyPanel({ sections, selectedKey }: { sections: NearbySection[]; selectedKey: string | null }) {
  return (
    <div className="hud-panel hud-list-panel" role="dialog" aria-label="近くの天体">
      {sections.map((sec) =>
        sec.items.length === 0 ? null : (
          <section key={sec.title}>
            <div className="hud-muted hud-small hud-list-title">{sec.title}</div>
            <ul>
              {sec.items.map((it) => (
                <li key={it.key}>
                  <button
                    type="button"
                    className={`hud-list-item${it.key === selectedKey ? ' is-selected' : ''}`}
                    onClick={() => hudActions.selectTarget(it.key)}
                  >
                    <span className="hud-list-name">{it.name}</span>
                    <span className="hud-muted hud-small">
                      {it.kindJa} ・ {it.distance}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
