import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/**
 * Reusable bar chart.
 *
 * @param {string[]} labels - x-axis labels, e.g. ["Jan", "Feb", "Mar"]
 * @param {{ label: string, data: number[], color?: string }[]} datasets
 * @param {string} [height] - tailwind height class for the wrapper, e.g. "h-72"
 */
export default function BarChart({ labels = [], datasets = [], height = "h-72" }) {
  const palette = ["#0056D2", "#F9BC15", "#FE4A65", "#1A253C"];

  const chartData = {
    labels,
    datasets: datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color || palette[i % palette.length],
      borderRadius: 6,
      maxBarThickness: 28,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: datasets.length > 1,
        position: "top",
        align: "end",
        labels: { boxWidth: 8, usePointStyle: true, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: "#1A253C",
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 12 } } },
      y: {
        beginAtZero: true,
        grid: { color: "#F4F7FC" },
        ticks: { font: { size: 12 } },
      },
    },
  };

  return (
    <div className={`w-full ${height}`}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
