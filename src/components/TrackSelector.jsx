export default function TrackSelector({ tracks, value, onChange }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #555", background: "#111", color: "white" }}
      >
        <option value="" disabled>-- choose a track --</option>
        {Object.entries(tracks).map(([trackName, track]) => {
          const prefix = track?.simple === false ? "🔷 " : "";
          return (
            <option key={trackName} value={trackName}>
              {prefix}{track.defaultDisplayName}
            </option>
          );
        })}
      </select>
    </label>
  );
}
