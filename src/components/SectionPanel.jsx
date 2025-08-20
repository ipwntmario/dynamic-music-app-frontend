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
          return (
            <button
              key={name}
              onClick={() => {
                if (isQueued) onToggleQueuedSection(null); // cancel
                else onToggleQueuedSection(name);          // set new queued
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #ccc",
                cursor: "pointer",
                background: isQueued ? "green" : "white",
                color: isQueued ? "white" : "black",
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
