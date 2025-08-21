export default function Transport({ isPlaying, onPlay, onStop, playLabel = "Play", playDisabled = false }) {
  return (
    <div style={{ marginTop: 20 }}>
      {!isPlaying ? (
        <button
          onClick={onPlay}
          disabled={playDisabled}
          style={{
            margin: 5, padding: "10px 20px", cursor: playDisabled ? "not-allowed" : "pointer",
            opacity: playDisabled ? 0.7 : 1
          }}
        >
          {playLabel}
        </button>
      ) : (
        <button
          onClick={onStop}
          style={{ margin: 5, padding: "10px 20px", background: "tomato", color: "white", cursor: "pointer" }}
        >
          Stop
        </button>
      )}
    </div>
  );
}
