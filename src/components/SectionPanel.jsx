function toArray(x) { return Array.isArray(x) ? x : (x ? [x] : []); }

export default function SectionPanel({
  sections,
  currentSectionName,
  queuedSectionName,
  autoLockedTargets = [],
  onToggleQueuedSection,
  largeButtons = false,
}) {
  const current = sections[currentSectionName];
  const nextSections = toArray(current?.nextSection);
  if (!current || nextSections.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {nextSections.map((name) => {
        const isQueued = queuedSectionName === name;
        const isAutoLocked = autoLockedTargets.includes(name);
        const targetSection = sections[name] || {};
        const isEnd = targetSection?.type === "end";

        // Base styles
        let background = "black";
        let color = "white";
        let border = "1px solid #555";
        let opacity = 1;

        if (isEnd) background = "#400000";                                        // red for end sections
        if (isQueued && !isAutoLocked) background = "#0aa";                    // green when queued
        if (isAutoLocked && !isQueued) { background = "#696969"; opacity = 0.9; } // disabled-grey
        if (isAutoLocked && isQueued) { background = "#4e694e"; opacity = 0.9; }  // disabled and queued grey-green

        const sizeStyle = largeButtons
          ? { padding: "10px 20px", fontSize: 16 }
          : { padding: "8px 14px", fontSize: 14 };

        return (
          <button
            key={name}
            disabled={isAutoLocked}
            onClick={() => {
              if (isAutoLocked) return;
              if (isQueued) onToggleQueuedSection(null);
              else onToggleQueuedSection(name);
            }}
            style={{
              ...sizeStyle,
              borderRadius: 8,
              border,
              cursor: isAutoLocked ? "not-allowed" : "pointer",
              background, color, opacity,
              minWidth: 120
            }}
            title={sections[name]?.defaultDisplayName ?? name}
          >
            {sections[name]?.defaultDisplayName ?? name}
          </button>
        );
      })}
    </div>
  );
}
