export default function TrackSelector({ tracks, value, onChange }) {
  return (
    <label>
      Select Track:{" "}
      <select value={value || ""} onChange={e => onChange(e.target.value)}>
        <option value="" disabled>-- choose a track --</option>
        {Object.entries(tracks).map(([trackName, track]) => (
          <option key={trackName} value={trackName}>
            {track.defaultDisplayName}
          </option>
        ))}
      </select>
    </label>
  );
}
