import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

/**
 * Reusable donut chart.
 *
 * @param {string[]} labels - segment labels, e.g. ["Present", "Absent", "Late"]
 * @param {number[]} data - segment values, e.g. [80, 15, 5]
 * @param {string[]} [colors] - optional override colors per segment
 * @param {string} [centerLabel] - optional text shown in the donut hole (e.g. "93%")
 * @param {string} [height] - tailwind height class for the wrapper, e.g. "h-64"
 */
export default function DonutChart({
  labels = [],
  data = [],
  colors,
  centerLabel,
  height = "h-64",
}) {
  const palette = ["#0056D2", "#F9BC15", "#FE4A65", "#1A253C", "#A0AEC0"];

  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors || labels.map((_, i) => palette[i % palette.length]),
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "72%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 8, usePointStyle: true, font: { size: 12 }, padding: 16 },
      },
      tooltip: {
        backgroundColor: "#1A253C",
        padding: 10,
        cornerRadius: 8,
      },
    },
  };

  return (
    <div className={`relative w-full ${height}`}>
      <Doughnut data={chartData} options={options} />
      {centerLabel && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center -mt-6">
            <span className="text-2xl font-semibold text-[var(--quinary)]">{centerLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
