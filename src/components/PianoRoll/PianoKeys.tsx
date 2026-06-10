/**
 * PianoKeys — vertical piano keyboard column (MIDI pitch 127 top → 0 bottom).
 * Renders 128 rows, highlights C notes and black key rows.
 */

const NOTE_HEIGHT = 14;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]); // indices in 12-note octave

interface PianoKeysProps {
  scrollY: number;
  onNotePreview?(pitch: number): void;
}

export function PianoKeys({ scrollY, onNotePreview }: PianoKeysProps) {
  const totalHeight = 128 * NOTE_HEIGHT;

  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{ width: 44, height: "100%" }}
    >
      <div
        className="absolute top-0 left-0 right-0"
        style={{ transform: `translateY(-${scrollY}px)`, height: totalHeight }}
      >
        {Array.from({ length: 128 }, (_, i) => {
          const pitch = 127 - i;
          const octave = Math.floor(pitch / 12);
          const noteIndex = pitch % 12;
          const isBlack = BLACK_KEYS.has(noteIndex);
          const isC = noteIndex === 0;
          const name = NOTE_NAMES[noteIndex];

          return (
            <div
              key={pitch}
              className={[
                "absolute left-0 right-0 flex items-center justify-end pr-1 cursor-pointer select-none",
                isBlack
                  ? "bg-[#1a1a22] border-b border-deck-border/30 hover:bg-[#252530]"
                  : "bg-[#23232e] border-b border-deck-border/20 hover:bg-[#2c2c3a]",
                isC ? "border-t border-deck-cyan/30" : "",
              ].join(" ")}
              style={{ top: i * NOTE_HEIGHT, height: NOTE_HEIGHT }}
              onMouseDown={() => onNotePreview?.(pitch)}
              title={`${name}${octave} (${pitch})`}
            >
              {isC && (
                <span className="text-[8px] font-mono text-deck-text-muted/60 mr-1">
                  C{octave}
                </span>
              )}
              {!isBlack && !isC && (
                <span className="text-[7px] font-mono text-deck-text-muted/30">{name}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { NOTE_HEIGHT };
