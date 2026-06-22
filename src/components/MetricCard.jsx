export default function MetricCard({ icon: Icon, label, value, trend, accent = "primary" }) {
  const accentMap = {
    primary: "bg-[var(--primary)]/10 text-[var(--primary)]",
    tertiary: "bg-[var(--tertiary)]/15 text-[var(--tertiary)]",
    quaternary: "bg-[var(--quaternary)]/10 text-[var(--quaternary)]",
  };

  const isPositive = trend?.startsWith("+");

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{label}</span>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>
            <Icon className="text-lg" />
          </div>
        )}
      </div>

      <div className="flex items-end justify-between">
        <span className="text-2xl font-semibold text-[var(--quinary)]">{value}</span>
        {trend && (
          <span
            className={`text-xs font-medium ${
              isPositive ? "text-green-600" : "text-[var(--quaternary)]"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
