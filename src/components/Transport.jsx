export default function Transport({ firstSectionName, firstSectionLabel, onPlaySection, onStop }) {
  return (
    <div style={{ marginTop: 20 }}>
      <button
        onClick={() => onPlaySection(firstSectionName)}
        style={{ margin: 5, padding: "10px 20px", cursor: "pointer" }}
      >
        {firstSectionLabel}
      </button>
      <button
        onClick={onStop}
        style={{ margin: 5, padding: "10px 20px", background: "tomato", color: "white", cursor: "pointer" }}
      >
        Stop
      </button>
    </div>
  );
}
