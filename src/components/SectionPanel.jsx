// Renders the current section's "nextSection" options as buttons.
// Clicking a button toggles it "queued" (green). Clicking the same again cancels.
// Another click on a different button switches the queued target.

function toArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

export default function SectionPanel({
  sections,
  currentSectionName,
  queuedSectionName,
  autoLockedTargets = [],              // NEW
  onToggleQueuedSection, // (sectionName|null) => void
}) {
  const current = sections[currentSectionName];
  const nextSections = toArray(current?.nextSection);

  if (!current || nextSections.length === 0) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>
        Transitions from: {current.defaultDisplayName ?? currentSectionName}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {nextSections.map((name) => {
          const isQueued = queuedSectionName === name;
          const isAutoLocked = autoLockedTargets.includes(name);
          const disabled = isAutoLocked;

          // colors:
          // - normal queued: green
          // - auto locked queued: grey-green
          // - auto locked not queued: grey
          const bg = isQueued
            ? (isAutoLocked ? "#6b8e23" /* greyish green */ : "green")
            : (isAutoLocked ? "#e0e0e0" /* grey */ : "white");
          const color = isQueued || isAutoLocked ? "white" : "black";
          const border = isAutoLocked ? "1px solid #bdbdbd" : "1px solid #ccc";

          return (
            <button
              key={name}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                if (isQueued) onToggleQueuedSection(null); // cancel
                else onToggleQueuedSection(name);          // set new queued
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border,
                cursor: disabled ? "not-allowed" : "pointer",
                background: bg,
                color,
                opacity: disabled && !isQueued ? 0.8 : 1,
              }}
              title={sections[name]?.defaultDisplayName ?? name}
            >
              {sections[name]?.defaultDisplayName ?? name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
