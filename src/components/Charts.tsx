const SERIES_COLORS = ["#3f5d4e", "#b56a45", "#2f463b", "#8a7355", "#6b6256", "#c4a574"];

export function chartColor(index: number) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function showLabel(index: number, total: number) {
  if (total <= 8) return true;
  const step = Math.ceil(total / 8);
  return index % step === 0 || index === total - 1;
}

export function LineChart({
  points,
  series,
}: {
  points: { label: string }[];
  series: { name: string; color: string; values: number[] }[];
}) {
  const width = 640;
  const height = 220;
  const pad = { left: 36, right: 12, top: 16, bottom: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...series.flatMap((item) => item.values));
  const xAt = (index: number) =>
    points.length <= 1 ? pad.left + innerW / 2 : pad.left + (index / (points.length - 1)) * innerW;
  const yAt = (value: number) => pad.top + innerH - (value / max) * innerH;
  const summary = series
    .map((item) => `${item.name}: ${item.values.reduce((sum, value) => sum + value, 0)}`)
    .join(". ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img" aria-label={summary || "Empty chart"}>
      {[0, 0.5, 1].map((tick) => {
        const y = yAt(max * tick);
        return (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#d8cbb8" strokeWidth="1" />
            <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#6b6256">
              {Math.round(max * tick)}
            </text>
          </g>
        );
      })}
      {series.map((item) => {
        const path = item.values
          .map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`)
          .join(" ");
        return (
          <g key={item.name}>
            <path d={path} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {item.values.map((value, index) => (
              <circle key={`${item.name}-${points[index]?.label ?? index}`} cx={xAt(index)} cy={yAt(value)} r="3" fill={item.color} />
            ))}
          </g>
        );
      })}
      {points.map((point, index) =>
        showLabel(index, points.length) ? (
          <text key={point.label + index} x={xAt(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="#6b6256">
            {point.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function PieChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const summary = slices.map((slice) => `${slice.label} ${slice.value}`).join(", ");

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0" role="img" aria-label={summary || "Empty pie"}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e6d8c4" strokeWidth="18" />
        {total > 0
          ? slices.map((slice) => {
              const length = (slice.value / total) * circumference;
              const circle = (
                <circle
                  key={slice.label}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="18"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 60 60)"
                />
              );
              offset += length;
              return circle;
            })
          : null}
      </svg>
      <ul className="space-y-2 text-sm">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
            <span>
              {slice.label} · {slice.value}
              {total > 0 ? ` · ${Math.round((slice.value / total) * 1000) / 10}%` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartLegend({ series }: { series: { name: string; color: string }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
      {series.map((item) => (
        <li key={item.name} className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
          {item.name}
        </li>
      ))}
    </ul>
  );
}
