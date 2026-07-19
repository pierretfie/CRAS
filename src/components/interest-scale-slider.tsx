import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const LEVELS = [
  { min: 1, max: 3,   label: "Unqualified",  color: "#ef4444" }, // red-500
  { min: 3, max: 5,   label: "Exploring",    color: "#f97316" }, // orange-500
  { min: 5, max: 7,   label: "Engaged",      color: "#eab308" }, // yellow-500
  { min: 7, max: 9,   label: "Committed",    color: "#84cc16" }, // lime-500
  { min: 9, max: 10.1,label: "High-Priority",color: "#22c55e" }, // green-500
];

function getLevel(value: number) {
  return LEVELS.find((l) => value >= l.min && value < l.max) ?? LEVELS[0];
}

// Interpolate hex color along red→green gradient based on 1–10 value
function interpolateColor(value: number): string {
  const t = Math.max(0, Math.min(1, (value - 1) / 9));
  // red(239,68,68) → orange(249,115,22) → yellow(234,179,8) → lime(132,204,22) → green(34,197,94)
  const stops = [
    [239, 68,  68 ],
    [249, 115, 22 ],
    [234, 179, 8  ],
    [132, 204, 22 ],
    [34,  197, 94 ],
  ];
  const seg = t * (stops.length - 1);
  const i = Math.floor(seg);
  const f = seg - i;
  const a = stops[Math.min(i, stops.length - 1)];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

interface InterestScaleSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function InterestScaleSlider({ value, onChange }: InterestScaleSliderProps) {
  const level = getLevel(value);
  const color = interpolateColor(value);

  return (
    <div className="space-y-3">
      <Label>Interest Scale</Label>

      {/* Value + level label */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold font-mono" style={{ color }}>
            {value.toFixed(1)}
          </span>
          <span className="text-sm font-semibold" style={{ color }}>
            {level.label}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">/ 10</span>
      </div>

      {/* Gradient track underlay + slider */}
      <div className="relative">
        {/* Gradient bar sitting behind the slider track */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full pointer-events-none"
          style={{
            background: "linear-gradient(to right, #ef4444, #f97316, #eab308, #84cc16, #22c55e)",
          }}
        />
        <Slider
          min={1}
          max={10}
          step={0.1}
          value={[value]}
          onValueChange={([v]) => onChange(v)}
          className="relative z-10 [&_[role=slider]]:border-2 [&_[role=slider]]:shadow-md"
          style={{ "--slider-thumb-color": color } as React.CSSProperties}
        />
      </div>

      {/* Scale end labels */}
      <div className="flex justify-between text-xs text-muted-foreground -mt-1">
        <span style={{ color: "#ef4444" }}>Unqualified</span>
        <span style={{ color: "#eab308" }}>Engaged</span>
        <span style={{ color: "#22c55e" }}>High-Priority</span>
      </div>

      {/* Quick-pick pills */}
      <div className="flex gap-1.5 flex-wrap pt-1">
        {LEVELS.map((l) => {
          const midpoint = (l.min + Math.min(l.max, 10)) / 2;
          const active = value >= l.min && value < l.max;
          return (
            <button
              key={l.label}
              type="button"
              onClick={() => onChange(parseFloat(midpoint.toFixed(1)))}
              className="px-2.5 py-0.5 rounded-full text-xs border transition-all cursor-pointer"
              style={
                active
                  ? { backgroundColor: l.color, borderColor: l.color, color: "#fff", fontWeight: 600 }
                  : { borderColor: "oklch(0.3 0.01 260)", color: "oklch(0.6 0.01 260)" }
              }
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
