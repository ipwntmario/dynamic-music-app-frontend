export default function Transport({ isPlaying, onPlay, onStop, playLabel = "Play", playDisabled = false, stopStyle }) {
  return (
    <div style={{ marginTop: 12 }}>
      {!isPlaying ? (
        <button
          onClick={onPlay}
          disabled={playDisabled}
          style={{
            padding: "10px 20px", borderRadius: 8, border: "1px solid #555",
            cursor: playDisabled ? "not-allowed" : "pointer",
            opacity: playDisabled ? 0.7 : 1, background: "black", color: "white"
          }}
        >
          {playLabel}
        </button>
      ) : (
        <button
          onClick={onStop}
          style={{
            padding: "10px 20px", borderRadius: 8, border: "1px solid #555",
            cursor: "pointer", background: "tomato", color: "white", ...(stopStyle || {})
          }}
        >
          ⏹
        </button>
      )}
    </div>
  );
}
