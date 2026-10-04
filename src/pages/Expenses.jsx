import React, { useEffect, useMemo, useRef, useState } from "react";
import useAuthStore from "../store/authStore";
import api from "../api/axios";
import Swal from "sweetalert2";

/* -------------------------------------------------------------------------- */
/*  Constants & helpers                                                       */
/* -------------------------------------------------------------------------- */

const BASE = "/expense-analytics";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

const MODES = [
  { id: "month", label: "Single Month", endpoint: "monthly/" },
  { id: "selected", label: "Selected Months", endpoint: "selected/" },
  { id: "year", label: "Full Year", endpoint: "yearly/" },
  { id: "years", label: "Compare Years", endpoint: "years/" },
];

const MANUAL_CATEGORIES = [
  { key: "electricity", label: "Electricity" },
  { key: "gas", label: "Gas" },
  { key: "rent", label: "Rent" },
  { key: "other_utilities", label: "Other Utilities" },
  { key: "paper", label: "Paper" },
  { key: "stationery", label: "Stationery" },
  { key: "other_office_supply", label: "Other Office Supplies" },
  { key: "staff_salary", label: "Staff Salary" },
];

const BAR_COLORS = [
  "bg-primary",
  "bg-accent-indigo",
  "bg-success",
  "bg-danger",
  "bg-neutral-500",
  "bg-primary/60",
  "bg-accent-indigo/60",
  "bg-success/60",
  "bg-neutral-400",
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (v) =>
  `Rs ${num(v).toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const compact = (v) => {
  const n = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (n >= 1e6) return `${sign}${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${sign}${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return `${sign}${n}`;
};

// Backend sends DRF decimals (strings). Normalise one month record.
const normMonth = (m) => {
  const me = m.manual_expenses || {};
  const manual = {};
  MANUAL_CATEGORIES.forEach((c) => (manual[c.key] = num(me[c.key])));
  return {
    month: m.month,
    year: m.year,
    revenue: num(m.revenue),
    payroll: num(m.teacher_payroll),
    manual,
    utilities: num(me.total_utilities),
    office: num(me.total_office_supplies),
    manualTotal: num(me.total_manual_expenses),
    total: num(m.total_expenses),
    profit: num(m.profit),
  };
};

const sumMonths = (months) =>
  months.reduce(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      payroll: acc.payroll + m.payroll,
      manual: acc.manual + m.manualTotal,
      total: acc.total + m.total,
      profit: acc.profit + m.profit,
    }),
    { revenue: 0, payroll: 0, manual: 0, total: 0, profit: 0 }
  );

const normGroup = (g) => {
  const months = (g.months || []).map(normMonth);
  const t = g.totals || {};
  return {
    year: g.year,
    months,
    totals: {
      revenue: num(t.revenue),
      payroll: num(t.teacher_payroll),
      manual: num(t.manual_expenses),
      total: num(t.total_expenses),
      profit: num(t.profit),
    },
  };
};

const isEmptyMonth = (m) =>
  m.revenue === 0 && m.payroll === 0 && m.manualTotal === 0;

// Pull a readable message out of any axios error (including blob responses).
const extractError = async (err) => {
  const data = err?.response?.data;
  try {
    if (data instanceof Blob) {
      const parsed = JSON.parse(await data.text());
      if (parsed?.error) return parsed.error;
    } else if (data?.error) {
      return data.error;
    } else if (data?.detail) {
      return data.detail;
    }
  } catch (_) {
    /* fall through */
  }
  if (err?.response?.status === 403)
    return "Only administrators can view expense analytics.";
  if (err?.response?.status >= 500)
    return "The server could not build this report. Please try again or check the server logs.";
  return "Something went wrong while contacting the server.";
};

const swalTheme = {
  confirmButtonColor: "var(--primary)",
  background: "var(--secondary)",
  color: "var(--quinary)",
};

/* -------------------------------------------------------------------------- */
/*  Small presentational pieces                                               */
/* -------------------------------------------------------------------------- */

const Label = ({ children }) => (
  <label className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-1">
    {children}
  </label>
);

const KpiCard = ({ title, value, hint, tone = "default" }) => {
  const toneClass =
    tone === "profit"
      ? value >= 0
        ? "text-success"
        : "text-danger"
      : "text-quinary";
  return (
    <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-5">
      <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
        {title}
      </p>
      <p className={`text-2xl font-bold mt-2 tracking-tight ${toneClass}`}>
        {tone === "profit" && value > 0 ? "+" : ""}
        {money(value)}
      </p>
      {hint && <p className="text-xs text-neutral-400 mt-1">{hint}</p>}
    </div>
  );
};

/* Grouped bars (revenue vs expenses) with a profit line. Pure SVG. */
const TrendChart = ({ items }) => {
  const [hover, setHover] = useState(null);

  const W = 760;
  const H = 280;
  const pad = { top: 16, right: 16, bottom: 34, left: 56 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const maxVal = Math.max(1, ...items.flatMap((i) => [i.revenue, i.expenses, i.profit]));
  const minVal = Math.min(0, ...items.map((i) => i.profit));
  const span = maxVal - minVal || 1;

  const y = (v) => pad.top + innerH - ((v - minVal) / span) * innerH;
  const zeroY = y(0);
  const groupW = innerW / items.length;
  const barW = Math.min(18, groupW / 3);

  const ticks = [0, 1, 2, 3, 4].map((i) => minVal + (span / 4) * i);

  const profitPath = items
    .map((it, i) => `${i === 0 ? "M" : "L"}${pad.left + groupW * i + groupW / 2},${y(it.profit)}`)
    .join(" ");

  const active = hover !== null ? items[hover] : null;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[560px]"
          role="img"
          aria-label="Revenue, expenses and profit chart"
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-neutral-200"
                strokeDasharray="3 4"
              />
              <text
                x={pad.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-neutral-400"
                fontSize="11"
              >
                {compact(Math.round(t))}
              </text>
            </g>
          ))}
          <line x1={pad.left} x2={W - pad.right} y1={zeroY} y2={zeroY} className="stroke-neutral-300" />

          {items.map((it, i) => {
            const cx = pad.left + groupW * i + groupW / 2;
            const revH = Math.abs(zeroY - y(it.revenue));
            const expH = Math.abs(zeroY - y(it.expenses));
            return (
              <g
                key={it.label}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  x={pad.left + groupW * i}
                  y={pad.top}
                  width={groupW}
                  height={innerH}
                  className={hover === i ? "fill-primary/5" : "fill-transparent"}
                />
                <rect
                  x={cx - barW - 1}
                  y={zeroY - revH}
                  width={barW}
                  height={revH}
                  rx="3"
                  className="fill-primary"
                />
                <rect
                  x={cx + 1}
                  y={zeroY - expH}
                  width={barW}
                  height={expH}
                  rx="3"
                  className="fill-danger/70"
                />
                <text
                  x={cx}
                  y={H - 12}
                  textAnchor="middle"
                  className={hover === i ? "fill-primary" : "fill-neutral-500"}
                  fontSize="11"
                  fontWeight="600"
                >
                  {it.label}
                </text>
              </g>
            );
          })}

          {items.length > 1 && (
            <path d={profitPath} fill="none" className="stroke-success" strokeWidth="2" />
          )}
          {items.map((it, i) => (
            <circle
              key={it.label}
              cx={pad.left + groupW * i + groupW / 2}
              cy={y(it.profit)}
              r={hover === i ? 5 : 3.5}
              className={it.profit >= 0 ? "fill-success" : "fill-danger"}
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 text-xs">
        <div className="flex items-center gap-4 text-neutral-500 font-medium">
          <span className="flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-sm bg-danger/70 inline-block" /> Expenses
          </span>
          <span className="flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-full bg-success inline-block" /> Profit
          </span>
        </div>
        <div className="text-neutral-500 min-h-[1.25rem]">
          {active ? (
            <>
              <span className="font-bold text-quinary">{active.full}</span>
              {" · "}Revenue {money(active.revenue)}
              {" · "}Expenses {money(active.expenses)}
              {" · "}
              <span className={active.profit >= 0 ? "text-success font-semibold" : "text-danger font-semibold"}>
                {active.profit >= 0 ? "Profit" : "Loss"} {money(Math.abs(active.profit))}
              </span>
            </>
          ) : (
            "Hover a column for exact figures."
          )}
        </div>
      </div>
    </div>
  );
};

const BreakdownList = ({ rows }) => {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (!rows.length) {
    return (
      <p className="text-sm text-neutral-400 py-6 text-center">
        No expenses recorded for this selection.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const pct = total ? (r.amount / total) * 100 : 0;
        return (
          <li key={r.category}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-semibold text-quinary">{r.category}</span>
              <span className="text-neutral-500">
                {money(r.amount)}{" "}
                <span className="text-xs text-neutral-400">({pct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

const Expenses = () => {
  const token = useAuthStore((state) => state.accessToken);
  const now = new Date();

  // Query state
  const [mode, setMode] = useState("year");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selMonths, setSelMonths] = useState([now.getMonth() + 1]);
  const [selYears, setSelYears] = useState([now.getFullYear() - 1, now.getFullYear()]);

  // Data state
  const [groups, setGroups] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(""); // "pdf" | "excel" | ""

  // Table-level (client) filters
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [expanded, setExpanded] = useState({});

  const requestId = useRef(0);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => current + 1 - i);
  }, []);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Params shared by the data endpoint and the PDF / Excel exports
  const params = useMemo(() => {
    if (mode === "month") return { month, year };
    if (mode === "selected") return { year, months: [...selMonths].sort((a, b) => a - b).join(",") };
    if (mode === "years") return { years: [...selYears].sort((a, b) => a - b).join(",") };
    return { year };
  }, [mode, month, year, selMonths, selYears]);

  const isValid =
    mode === "selected" ? selMonths.length > 0 : mode === "years" ? selYears.length > 0 : true;

  const paramsKey = JSON.stringify(params);

  /* ------------------------------ Data fetching ----------------------------- */
  useEffect(() => {
    if (!token) return;
    if (!isValid) {
      setGroups([]);
      setDashboard(null);
      return;
    }

    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      const endpoint = MODES.find((m) => m.id === mode).endpoint;

      try {
        const mainReq = api.get(`${BASE}/${endpoint}`, { params, headers: authHeaders });
        // Year mode also pulls the chart-ready dashboard payload
        const dashReq =
          mode === "year"
            ? api
                .get(`${BASE}/dashboard/`, { params: { year }, headers: authHeaders })
                .catch(() => null)
            : Promise.resolve(null);

        const [res, dash] = await Promise.all([mainReq, dashReq]);
        if (id !== requestId.current) return; // a newer request superseded this one

        const d = res.data;
        let next = [];
        if (mode === "month") {
          const m = normMonth(d);
          next = [{ year: m.year, months: [m], totals: sumMonths([m]) }];
        } else if (mode === "years") {
          next = (d.years || []).map(normGroup);
        } else {
          next = [normGroup(d)];
        }

        setGroups(next);
        setDashboard(dash?.data || null);
        setExpanded({});
      } catch (err) {
        if (id !== requestId.current) return;
        setGroups([]);
        setDashboard(null);
        setError(await extractError(err));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, mode, paramsKey, isValid]);

  /* -------------------------------- Exporting ------------------------------- */
  const handleExport = async (type) => {
    if (!isValid) return;
    setExporting(type);
    try {
      const res = await api.get(`${BASE}/export/${type}/`, {
        params,
        headers: authHeaders,
        responseType: "blob",
      });

      const ext = type === "pdf" ? "pdf" : "xlsx";
      const scope =
        mode === "month"
          ? `${month}_${year}`
          : mode === "selected"
          ? `${year}_selected`
          : mode === "years"
          ? "years"
          : `${year}`;

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `financial_analytics_${scope}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      Swal.fire({ title: "Export failed", text: await extractError(err), icon: "error", ...swalTheme });
    } finally {
      setExporting("");
    }
  };

  /* ------------------------------ Derived data ------------------------------ */
  const allMonths = useMemo(() => groups.flatMap((g) => g.months), [groups]);

  const overall = useMemo(() => {
    if (!groups.length) return null;
    return groups.reduce(
      (acc, g) => ({
        revenue: acc.revenue + g.totals.revenue,
        payroll: acc.payroll + g.totals.payroll,
        manual: acc.manual + g.totals.manual,
        total: acc.total + g.totals.total,
        profit: acc.profit + g.totals.profit,
      }),
      { revenue: 0, payroll: 0, manual: 0, total: 0, profit: 0 }
    );
  }, [groups]);

  // Chart series: months for one year / selection, one bar group per year when comparing
  const chartItems = useMemo(() => {
    if (mode === "month") return [];
    if (mode === "years") {
      return groups.map((g) => ({
        label: String(g.year),
        full: `Year ${g.year}`,
        revenue: g.totals.revenue,
        expenses: g.totals.total,
        profit: g.totals.profit,
      }));
    }
    // Year mode prefers the dedicated dashboard endpoint
    if (mode === "year" && dashboard?.months?.length) {
      return dashboard.months.map((m) => ({
        label: MONTHS_SHORT[m.month - 1],
        full: m.label || MONTHS[m.month - 1],
        revenue: num(m.revenue),
        expenses: num(m.total_expenses),
        profit: num(m.profit),
      }));
    }
    return allMonths.map((m) => ({
      label: MONTHS_SHORT[m.month - 1],
      full: `${MONTHS[m.month - 1]} ${m.year}`,
      revenue: m.revenue,
      expenses: m.total,
      profit: m.profit,
    }));
  }, [mode, groups, dashboard, allMonths]);

  // Expense breakdown: backend's dashboard in year mode, computed everywhere else
  const expenseBreakdown = useMemo(() => {
    if (mode === "year" && dashboard?.expense_breakdown) {
      return dashboard.expense_breakdown
        .map((r) => ({ category: r.category, amount: num(r.amount) }))
        .sort((a, b) => b.amount - a.amount);
    }
    const rows = [{ category: "Teacher Payroll", amount: allMonths.reduce((s, m) => s + m.payroll, 0) }];
    MANUAL_CATEGORIES.forEach((c) =>
      rows.push({
        category: c.label,
        amount: allMonths.reduce((s, m) => s + m.manual[c.key], 0),
      })
    );
    return rows.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
  }, [mode, dashboard, allMonths]);

  const revenueBreakdown = useMemo(() => {
    if (mode === "year" && dashboard?.revenue_breakdown) {
      return dashboard.revenue_breakdown.map((r) => ({ category: r.category, amount: num(r.amount) }));
    }
    return [{ category: "Student Fees", amount: overall?.revenue || 0 }];
  }, [mode, dashboard, overall]);

  // Client-side table filters
  const filterMonths = (months) => {
    const q = search.trim().toLowerCase();
    return months.filter((m) => {
      if (q && !MONTHS[m.month - 1].toLowerCase().includes(q)) return false;
      if (resultFilter === "profit" && m.profit < 0) return false;
      if (resultFilter === "loss" && m.profit >= 0) return false;
      if (hideEmpty && isEmptyMonth(m)) return false;
      return true;
    });
  };

  const toggleRow = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleInList = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const resetTableFilters = () => {
    setSearch("");
    setResultFilter("");
    setHideEmpty(false);
  };

  const scopeLabel =
    mode === "month"
      ? `${MONTHS[month - 1]} ${year}`
      : mode === "selected"
      ? `${selMonths.length} month${selMonths.length === 1 ? "" : "s"} of ${year}`
      : mode === "years"
      ? `${selYears.length} year${selYears.length === 1 ? "" : "s"}`
      : `Full year ${year}`;

  /* --------------------------------- Render --------------------------------- */
  return (
    <div className="p-6 bg-secondary text-quinary min-h-screen font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-quinary">
            Expense & Profit Analytics
          </h1>
          <p className="text-neutral-500 text-sm mt-1">
            Track fee collections against teacher payroll and running costs, and export the report.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleExport("pdf")}
            disabled={!isValid || !!exporting || loading}
            className="bg-surface text-quinary border border-neutral-300 hover:border-primary hover:text-primary font-semibold px-5 py-3 rounded-xl transition-all text-sm disabled:opacity-50"
          >
            {exporting === "pdf" ? "Preparing PDF..." : "Download PDF"}
          </button>
          <button
            onClick={() => handleExport("excel")}
            disabled={!isValid || !!exporting || loading}
            className="bg-primary hover:bg-quinary text-white font-semibold px-6 py-3 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] disabled:opacity-50 text-sm"
          >
            {exporting === "excel" ? "Preparing Excel..." : "Download Excel"}
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-5 mb-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                mode === m.id
                  ? "bg-primary text-white border-primary"
                  : "bg-secondary text-neutral-600 border-neutral-300 hover:border-primary hover:text-primary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {mode !== "years" && (
            <div className="flex flex-col">
              <Label>
                Year <span className="text-danger">*</span>
              </Label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="bg-secondary text-quinary border border-neutral-300 rounded-xl p-2.5 outline-none focus:border-primary text-sm cursor-pointer font-medium"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === "month" && (
            <div className="flex flex-col">
              <Label>
                Month <span className="text-danger">*</span>
              </Label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="bg-secondary text-quinary border border-neutral-300 rounded-xl p-2.5 outline-none focus:border-primary text-sm cursor-pointer font-medium"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {mode === "selected" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>
                Months to include <span className="text-danger">*</span>
              </Label>
              <div className="flex gap-3 text-xs font-semibold">
                <button
                  onClick={() => setSelMonths(MONTHS.map((_, i) => i + 1))}
                  className="text-neutral-500 hover:text-primary"
                >
                  Select all
                </button>
                <button onClick={() => setSelMonths([])} className="text-neutral-500 hover:text-primary">
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
              {MONTHS_SHORT.map((m, i) => {
                const on = selMonths.includes(i + 1);
                return (
                  <button
                    key={m}
                    onClick={() => toggleInList(selMonths, setSelMonths, i + 1)}
                    aria-pressed={on}
                    className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                      on
                        ? "bg-primary/10 text-primary border-primary/40"
                        : "bg-surface text-neutral-500 border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
            {!selMonths.length && (
              <p className="text-xs text-danger mt-2">Pick at least one month to load the report.</p>
            )}
          </div>
        )}

        {mode === "years" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>
                Years to compare <span className="text-danger">*</span>
              </Label>
              <button onClick={() => setSelYears([])} className="text-xs font-semibold text-neutral-500 hover:text-primary">
                Clear
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {yearOptions.map((y) => {
                const on = selYears.includes(y);
                return (
                  <button
                    key={y}
                    onClick={() => toggleInList(selYears, setSelYears, y)}
                    aria-pressed={on}
                    className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                      on
                        ? "bg-primary/10 text-primary border-primary/40"
                        : "bg-surface text-neutral-500 border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
            {!selYears.length && (
              <p className="text-xs text-danger mt-2">Pick at least one year to load the report.</p>
            )}
          </div>
        )}
      </div>

      {/* States */}
      {loading ? (
        <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-12 text-center">
          <p className="text-neutral-500 text-sm font-medium animate-pulse">
            Calculating {scopeLabel.toLowerCase()}...
          </p>
        </div>
      ) : error ? (
        <div className="bg-surface rounded-2xl border border-danger/30 shadow-sm p-10 text-center">
          <h3 className="text-lg font-bold text-danger">Could not load the report</h3>
          <p className="text-neutral-500 text-sm mt-1 max-w-md mx-auto">{error}</p>
        </div>
      ) : !isValid || !overall ? (
        <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-16 text-center">
          <h3 className="text-lg font-bold text-quinary">No period selected</h3>
          <p className="text-neutral-400 text-sm mt-1 max-w-md mx-auto">
            Choose the months or years above to see revenue, expenses and profit.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <KpiCard title="Revenue collected" value={overall.revenue} hint={scopeLabel} />
            <KpiCard title="Teacher payroll" value={overall.payroll} hint="From payroll records" />
            <KpiCard title="Running costs" value={overall.manual} hint="Utilities, supplies, staff" />
            <KpiCard title="Total expenses" value={overall.total} hint="Payroll + running costs" />
            <KpiCard
              title={overall.profit >= 0 ? "Net profit" : "Net loss"}
              value={overall.profit}
              tone="profit"
              hint="Revenue minus expenses"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {mode !== "month" && (
              <div className="xl:col-span-2 bg-surface rounded-2xl border border-neutral-200 shadow-sm p-5">
                <h2 className="text-base font-bold text-quinary mb-4">
                  {mode === "years" ? "Year-by-year comparison" : "Monthly performance"}
                </h2>
                <TrendChart items={chartItems} />
              </div>
            )}

            <div
              className={`bg-surface rounded-2xl border border-neutral-200 shadow-sm p-5 ${
                mode === "month" ? "xl:col-span-3" : ""
              }`}
            >
              <h2 className="text-base font-bold text-quinary mb-4">Where the money went</h2>
              <BreakdownList rows={expenseBreakdown} />
              <div className="mt-5 pt-4 border-t border-neutral-100">
                <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2">
                  Income source
                </p>
                {revenueBreakdown.map((r) => (
                  <div key={r.category} className="flex justify-between text-sm">
                    <span className="font-semibold text-quinary">{r.category}</span>
                    <span className="text-neutral-500">{money(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Table filters */}
          <div className="bg-surface rounded-2xl border border-neutral-200 shadow-sm p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div className="flex flex-col">
                <Label>Search month</Label>
                <input
                  type="text"
                  placeholder="e.g. March"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-secondary text-quinary px-3 py-2.5 border border-neutral-300 rounded-xl outline-none focus:border-primary text-sm"
                />
              </div>
              <div className="flex flex-col">
                <Label>Result</Label>
                <select
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  className="bg-secondary text-quinary border border-neutral-300 rounded-xl p-2.5 outline-none focus:border-primary text-sm cursor-pointer"
                >
                  <option value="">All months</option>
                  <option value="profit">Profit only</option>
                  <option value="loss">Loss only</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-600 font-medium pb-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideEmpty}
                  onChange={(e) => setHideEmpty(e.target.checked)}
                  className="accent-primary w-4 h-4"
                />
                Hide months with no activity
              </label>
              <button
                onClick={resetTableFilters}
                className="text-xs font-semibold text-neutral-600 hover:text-primary bg-neutral-50 hover:bg-neutral-100 p-2.5 rounded-lg transition-colors border border-neutral-200"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Month tables, one card per year */}
          {groups.map((g) => {
            const rows = filterMonths(g.months);
            return (
              <div
                key={g.year}
                className="bg-surface rounded-2xl border border-neutral-200 shadow-sm overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-neutral-200 bg-secondary flex items-center justify-between">
                  <h3 className="font-bold text-quinary">{g.year}</h3>
                  <span
                    className={`text-sm font-bold ${g.totals.profit >= 0 ? "text-success" : "text-danger"}`}
                  >
                    {g.totals.profit >= 0 ? "Profit" : "Loss"} {money(Math.abs(g.totals.profit))}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary border-b border-neutral-200 text-xs font-bold uppercase tracking-wider text-neutral-600">
                        <th className="p-4 sticky left-0 bg-secondary z-10 min-w-[150px]">Month</th>
                        <th className="p-4 text-right">Revenue</th>
                        <th className="p-4 text-right">Payroll</th>
                        <th className="p-4 text-right">Utilities</th>
                        <th className="p-4 text-right">Office</th>
                        <th className="p-4 text-right">Staff Salary</th>
                        <th className="p-4 text-right">Total Expenses</th>
                        <th className="p-4 text-right">Profit / Loss</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-sm">
                      {rows.length ? (
                        rows.map((m, idx) => {
                          const key = `${m.year}-${m.month}`;
                          const open = !!expanded[key];
                          const bg = idx % 2 === 1 ? "bg-neutral-50" : "bg-surface";
                          return (
                            <React.Fragment key={key}>
                              <tr
                                onClick={() => toggleRow(key)}
                                className="cursor-pointer hover:bg-primary/5 transition-colors"
                              >
                                <td className={`p-4 font-bold text-quinary sticky left-0 z-10 ${bg}`}>
                                  <button
                                    aria-expanded={open}
                                    aria-label={`Show ${MONTHS[m.month - 1]} cost details`}
                                    className="flex items-center gap-2 outline-none focus-visible:text-primary"
                                  >
                                    <span
                                      className={`inline-block text-neutral-400 text-xs transition-transform ${
                                        open ? "rotate-90" : ""
                                      }`}
                                    >
                                      ▶
                                    </span>
                                    {MONTHS[m.month - 1]}
                                  </button>
                                </td>
                                <td className={`p-4 text-right font-semibold ${bg}`}>{money(m.revenue)}</td>
                                <td className={`p-4 text-right text-neutral-600 ${bg}`}>{money(m.payroll)}</td>
                                <td className={`p-4 text-right text-neutral-600 ${bg}`}>{money(m.utilities)}</td>
                                <td className={`p-4 text-right text-neutral-600 ${bg}`}>{money(m.office)}</td>
                                <td className={`p-4 text-right text-neutral-600 ${bg}`}>
                                  {money(m.manual.staff_salary)}
                                </td>
                                <td className={`p-4 text-right font-semibold ${bg}`}>{money(m.total)}</td>
                                <td
                                  className={`p-4 text-right font-bold ${bg} ${
                                    m.profit >= 0 ? "text-success" : "text-danger"
                                  }`}
                                >
                                  {m.profit > 0 ? "+" : ""}
                                  {money(m.profit)}
                                </td>
                              </tr>

                              {open && (
                                <tr>
                                  <td colSpan={8} className="p-0 bg-primary/5">
                                    <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                      {MANUAL_CATEGORIES.map((c) => (
                                        <div
                                          key={c.key}
                                          className="bg-surface border border-neutral-200 rounded-xl px-3 py-2"
                                        >
                                          <p className="text-[11px] text-neutral-500 font-semibold">
                                            {c.label}
                                          </p>
                                          <p
                                            className={`text-sm font-bold ${
                                              m.manual[c.key] ? "text-quinary" : "text-neutral-300"
                                            }`}
                                          >
                                            {money(m.manual[c.key])}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="p-10 text-center text-neutral-400">
                            No months match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-secondary border-t border-neutral-200 text-sm font-bold">
                        <td className="p-4 sticky left-0 bg-secondary z-10">Total</td>
                        <td className="p-4 text-right">{money(g.totals.revenue)}</td>
                        <td className="p-4 text-right">{money(g.totals.payroll)}</td>
                        <td className="p-4 text-right text-neutral-500" colSpan={3}>
                          Running costs {money(g.totals.manual)}
                        </td>
                        <td className="p-4 text-right">{money(g.totals.total)}</td>
                        <td
                          className={`p-4 text-right ${
                            g.totals.profit >= 0 ? "text-success" : "text-danger"
                          }`}
                        >
                          {g.totals.profit > 0 ? "+" : ""}
                          {money(g.totals.profit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="p-4 bg-secondary border-t border-neutral-200 text-xs text-neutral-500">
                  Showing <span className="font-bold text-quinary">{rows.length}</span> of{" "}
                  <span className="font-bold text-quinary">{g.months.length}</span> months. Click a row to see
                  the utilities, supplies and salary breakdown.
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Expenses;