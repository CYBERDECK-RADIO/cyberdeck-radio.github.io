/**
 * The screen saver's analogue dial, styled after the Apple Watch's clean
 * minimal faces: a hairline bezel, ticked minute rail with accented hour
 * markers, and a fine sweeping second hand that reads hours off the host's
 * local timezone (never UTC).
 *
 *   Date ──▶ { hour hand, minute hand, second hand } rotated around the hub
 */

type AnalogueClockProps = {
  date: Date;
};

const CENTER = 100;
const MINUTE_TICKS = Array.from({ length: 60 }, (_, i) => i);

function angleForHand(progress: number): number {
  return progress * 360;
}

export default function AnalogueClock({ date }: AnalogueClockProps) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  const hourAngle = angleForHand(((hours % 12) + minutes / 60) / 12);
  const minuteAngle = angleForHand((minutes + seconds / 60) / 60);
  const secondAngle = angleForHand(seconds / 60);

  return (
    <svg
      className="analogue-clock__dial"
      viewBox="0 0 200 200"
      role="img"
      aria-hidden="true"
    >
      <circle cx={CENTER} cy={CENTER} r={96} className="analogue-clock__bezel" />

      {MINUTE_TICKS.map((tick) => {
        const major = tick % 5 === 0;
        return (
          <line
            key={tick}
            x1={CENTER}
            y1={major ? 86 : 91}
            x2={CENTER}
            y2={major ? 79 : 89}
            stroke="var(--line-soft)"
            strokeWidth={major ? 3 : 1.5}
            strokeLinecap="round"
            transform={`rotate(${tick * 6} ${CENTER} ${CENTER})`}
          />
        );
      })}

      <g
        className="analogue-clock__hand"
        transform={`rotate(${hourAngle} ${CENTER} ${CENTER})`}
      >
        <rect
          x={CENTER - 2.7}
          y={CENTER - 42}
          width={5.4}
          height={42}
          rx={2.7}
          fill="var(--text)"
        />
      </g>

      <g
        className="analogue-clock__hand"
        transform={`rotate(${minuteAngle} ${CENTER} ${CENTER})`}
      >
        <rect
          x={CENTER - 2}
          y={CENTER - 62}
          width={4}
          height={62}
          rx={2}
          fill="var(--text)"
        />
      </g>

      <g
        className="analogue-clock__second"
        transform={`rotate(${secondAngle} ${CENTER} ${CENTER})`}
      >
        <line
          x1={CENTER}
          y1={CENTER + 16}
          x2={CENTER}
          y2={CENTER - 76}
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>

      <circle cx={CENTER} cy={CENTER} r={5} className="analogue-clock__hub" />
    </svg>
  );
}