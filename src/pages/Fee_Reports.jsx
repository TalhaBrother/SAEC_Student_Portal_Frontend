import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TABS = [
  { key: 'analytics', label: 'Analytics' },
  { key: 'paid', label: 'Paid Reports' },
  { key: 'defaulters', label: 'Defaulters' },
  { key: 'search', label: 'Student Search' },
];

// When a request uses responseType: 'blob', Axios also returns error
// bodies as a Blob — even though the backend sent JSON. This reads the
// blob back out as text and parses it so we can surface the backend's
// actual error message instead of a generic failure message.
const extractBlobErrorMessage = async (error, fallback) => {
  const data = error.response?.data;
  if (!data) return fallback;
  try {
    const text = typeof data.text === 'function' ? await data.text() : null;
    if (!text) return fallback;
    const parsed = JSON.parse(text);
    return parsed.error || parsed.detail || fallback;
  } catch {
    return fallback;
  }
};

const formatMoney = (value) => {
  const num = Number(value || 0);
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const StatusBadge = ({ status }) => (
  <span
    className={`px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${
      status === 'PAID'
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-amber-50 text-amber-700 border border-amber-200'
    }`}
  >
    {status}
  </span>
);

const Message = ({ message }) => {
  if (!message?.text) return null;
  return (
    <div
      className={`p-3 rounded-xl text-sm mb-6 text-center border max-w-xl ${
        message.type === 'success'
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-red-50 text-red-700 border-red-200'
      }`}
    >
      {message.text}
    </div>
  );
};

const Field = ({ label, children, hint }) => (
  <div className="flex flex-col w-full">
    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
      {label}
    </label>
    {children}
    {hint && <p className="text-gray-400 text-xs mt-1">{hint}</p>}
  </div>
);

const inputClass =
  "bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm";
const selectClass = `${inputClass} cursor-pointer`;
const primaryBtnClass =
  "bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer text-sm font-semibold tracking-wide uppercase";
const secondaryBtnClass =
  "bg-white border border-gray-300 hover:border-[var(--primary)] disabled:opacity-50 text-[var(--quinary)] font-medium py-3 px-6 rounded-xl transition-all duration-300 cursor-pointer text-sm font-semibold tracking-wide uppercase";

const StatCard = ({ label, value, accent }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-1">
    <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
    <span className={`text-2xl font-bold ${accent || 'text-[var(--quinary)]'}`}>{value}</span>
  </div>
);

const EmptyState = ({ text }) => (
  <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-400 text-sm">
    {text}
  </div>
);

const TableShell = ({ headers, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/60">
          {headers.map((h) => (
            <th
              key={h}
              className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold whitespace-nowrap"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const PeriodToggle = ({ value, onChange }) => (
  <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
    {PERIODS.map((p) => (
      <button
        key={p.key}
        type="button"
        onClick={() => onChange(p.key)}
        className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
          value === p.key
            ? 'bg-[var(--primary)] text-white'
            : 'text-gray-500 hover:text-[var(--quinary)]'
        }`}
      >
        {p.label}
      </button>
    ))}
  </div>
);

const Fee_Reports = () => {
  const token = useAuthStore((state) => state.accessToken);
  const today = new Date();

  const [activeTab, setActiveTab] = useState('analytics');
  const [Classes, setClasses] = useState([]);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await api.get('/classes/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setClasses(res.data);
      } catch (err) {
        console.log(err);
      }
    };
    if (token) fetchClasses();
  }, [token]);

  return (
    <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
      <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">
        Fee Reports
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Analytics, collection history, defaulters, and per-student fee status — all in one place.
      </p>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold tracking-wide transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-[var(--primary)] text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:text-[var(--quinary)] hover:border-[var(--primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'analytics' && (
        <AnalyticsTab token={token} today={today} />
      )}
      {activeTab === 'paid' && (
        <PaidReportsTab token={token} today={today} />
      )}
      {activeTab === 'defaulters' && (
        <DefaultersTab token={token} today={today} Classes={Classes} />
      )}
      {activeTab === 'search' && (
        <StudentSearchTab token={token} />
      )}
    </div>
  );
};

/* ----------------------------- Analytics Tab ---------------------------- */

const AnalyticsTab = ({ token, today }) => {
  const [period, setPeriod] = useState('monthly');

  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [date, setDate] = useState(todayISO());

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [data, setData] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    setData(null);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      let res;
      if (period === 'monthly') {
        res = await api.get('/fees-report/analytics/', {
          headers,
          params: { month, year },
        });
      } else if (period === 'daily') {
        res = await api.get('/fees-report/analytics/daily/', {
          headers,
          params: { date },
        });
      } else {
        res = await api.get('/fees-report/analytics/weekly/', {
          headers,
          params: { date },
        });
      }
      setData(res.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setMessage({ type: 'error', text: 'Failed to load analytics. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchData();
          }}
          className="flex flex-wrap items-end gap-4"
        >
          {period === 'monthly' && (
            <>
              <Field label="Month">
                <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Year">
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </>
          )}

          {(period === 'daily' || period === 'weekly') && (
            <Field label={period === 'daily' ? 'Date' : 'Any date in the week'}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          <button type="submit" disabled={loading} className={primaryBtnClass}>
            {loading ? 'Loading...' : 'Load Analytics'}
          </button>
        </form>
      </div>

      <Message message={message} />

      {data && period === 'monthly' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl">
          <StatCard label="Total Active Students" value={data.total_students} />
          <StatCard label="Paid" value={data.paid_count} accent="text-green-600" />
          <StatCard label="Unpaid" value={data.unpaid_count} accent="text-amber-600" />
          <StatCard label="Amount Collected" value={formatMoney(data.amount_collected)} accent="text-green-600" />
          <StatCard label="Amount Pending" value={formatMoney(data.amount_pending)} accent="text-amber-600" />
        </div>
      )}

      {data && period === 'daily' && (
        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          <StatCard label={`Payments on ${formatDate(data.date)}`} value={data.paid_count} />
          <StatCard label="Amount Collected" value={formatMoney(data.amount_collected)} accent="text-green-600" />
        </div>
      )}

      {data && period === 'weekly' && (
        <div className="space-y-3 max-w-2xl">
          <p className="text-sm text-gray-500">
            Week of {formatDate(data.week_start)} – {formatDate(data.week_end)}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Payments This Week" value={data.paid_count} />
            <StatCard label="Amount Collected" value={formatMoney(data.amount_collected)} accent="text-green-600" />
          </div>
        </div>
      )}
    </div>
  );
};

/* --------------------------- Paid Reports Tab --------------------------- */

const PaidReportsTab = ({ token, today }) => {
  const [period, setPeriod] = useState('daily');

  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [date, setDate] = useState(todayISO());

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [rows, setRows] = useState([]);
  const [weekRange, setWeekRange] = useState(null);
  const [fetched, setFetched] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    setWeekRange(null);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      let res;
      if (period === 'daily') {
        res = await api.get('/fee-submission/reports/daily/', { headers, params: { date } });
        setRows(res.data);
      } else if (period === 'weekly') {
        res = await api.get('/fee-submission/reports/weekly/', { headers, params: { date } });
        setRows(res.data.results || []);
        setWeekRange({ start: res.data.week_start, end: res.data.week_end });
      } else {
        res = await api.get('/fee-submission/reports/monthly/', { headers, params: { month, year } });
        setRows(res.data);
      }
      setFetched(true);
    } catch (error) {
      console.error('Error fetching paid reports:', error);
      setMessage({ type: 'error', text: 'Failed to load report. Please try again.' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period]);

  return (
    <div className="space-y-6">
      <PeriodToggle value={period} onChange={setPeriod} />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchData();
          }}
          className="flex flex-wrap items-end gap-4"
        >
          {period === 'monthly' ? (
            <>
              <Field label="Month">
                <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Year">
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} />
              </Field>
            </>
          ) : (
            <Field label={period === 'daily' ? 'Date' : 'Any date in the week'}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
          )}

          <button type="submit" disabled={loading} className={primaryBtnClass}>
            {loading ? 'Loading...' : 'Load Report'}
          </button>
        </form>
      </div>

      <Message message={message} />

      {weekRange && (
        <p className="text-sm text-gray-500">
          Week of {formatDate(weekRange.start)} – {formatDate(weekRange.end)}
        </p>
      )}

      {fetched && rows.length === 0 && !loading && (
        <EmptyState text="No paid vouchers found for the selected period." />
      )}

      {rows.length > 0 && (
        <TableShell headers={['Challan No', 'GR No', 'Student', 'Class', 'Month/Year', 'Amount', 'Status', 'Paid At']}>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
              <td className="px-4 py-3">{row.challan_no}</td>
              <td className="px-4 py-3">{row.gr_no}</td>
              <td className="px-4 py-3 font-medium">{row.student_name}</td>
              <td className="px-4 py-3">{row.class_name}</td>
              <td className="px-4 py-3">{MONTH_NAMES[row.month - 1]} {row.year}</td>
              <td className="px-4 py-3">{formatMoney(row.amount_within_due_date)}</td>
              <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              <td className="px-4 py-3 text-gray-500">{formatDateTime(row.paid_at)}</td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
};

/* ----------------------------- Defaulters Tab ---------------------------- */

const DefaultersTab = ({ token, today, Classes }) => {
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [classId, setClassId] = useState('');

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [rows, setRows] = useState([]);
  const [fetched, setFetched] = useState(false);

  const buildParams = () => {
    const params = { month, year };
    if (classId) params.class_id = classId;
    return params;
  };

  const fetchData = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.get('/fee-submission/reports/defaulters/', {
        headers: { Authorization: `Bearer ${token}` },
        params: buildParams(),
      });
      setRows(res.data);
      setFetched(true);
    } catch (error) {
      console.error('Error fetching defaulters:', error);
      setMessage({ type: 'error', text: 'Failed to load defaulter list. Please try again.' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await api.get('/fee-submission/reports/defaulters/pdf/', {
        headers: { Authorization: `Bearer ${token}` },
        params: buildParams(),
        responseType: 'blob',
      });
      const file = new Blob([res.data], { type: 'application/pdf' });
      window.open(URL.createObjectURL(file), '_blank');
    } catch (error) {
      console.error('Error downloading defaulter PDF:', error);
      const text = await extractBlobErrorMessage(error, 'Failed to download the defaulter report PDF.');
      setMessage({ type: 'error', text });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
        <form onSubmit={fetchData} className="flex flex-wrap items-end gap-4">
          <Field label="Month">
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Class (optional)">
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={selectClass}>
              <option value="">All Classes</option>
              {Classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.display_name}</option>
              ))}
            </select>
          </Field>

          <button type="submit" disabled={loading} className={primaryBtnClass}>
            {loading ? 'Loading...' : 'Load Defaulters'}
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className={secondaryBtnClass}
          >
            {downloading ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        </form>
      </div>

      <Message message={message} />

      {fetched && rows.length === 0 && !loading && (
        <EmptyState text="No defaulters found — everyone in scope has paid for this month." />
      )}

      {rows.length > 0 && (
        <TableShell headers={['GR No', 'Name', 'Father Name', 'Class', 'Phone']}>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
              <td className="px-4 py-3">{row.gr_no}</td>
              <td className="px-4 py-3 font-medium">{row.full_name}</td>
              <td className="px-4 py-3">{row.father_name}</td>
              <td className="px-4 py-3">{row.student_class?.display_name || row.student_class?.name || '—'}</td>
              <td className="px-4 py-3">{row.phone}</td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
};

/* --------------------------- Student Search Tab -------------------------- */

const StudentSearchTab = ({ token }) => {
  const [grNo, setGrNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [student, setStudent] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [reprintingId, setReprintingId] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!grNo.trim()) return;

    setLoading(true);
    setMessage({ type: '', text: '' });
    setStudent(null);

    try {
      const res = await api.get(`/fee-submission/search/${encodeURIComponent(grNo.trim())}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStudent(res.data);
    } catch (error) {
      console.error('Error searching student:', error);
      const status = error.response?.status;
      setMessage({
        type: 'error',
        text: status === 404 ? 'No student found with that GR No.' : 'Failed to search. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (voucher) => {
    const newStatus = voucher.status === 'PAID' ? 'PENDING' : 'PAID';
    setUpdatingId(voucher.id);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.patch(
        `/fee-submission/vouchers/${voucher.id}/status/`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setStudent((prev) => ({
        ...prev,
        fee_vouchers: prev.fee_vouchers.map((v) =>
          v.id === voucher.id ? { ...v, ...res.data } : v
        ),
      }));
      setMessage({ type: 'success', text: `Voucher #${voucher.challan_no} marked as ${newStatus}.` });
    } catch (error) {
      console.error('Error updating voucher status:', error);
      setMessage({ type: 'error', text: 'Failed to update voucher status. Please try again.' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReprint = async (voucher) => {
    setReprintingId(voucher.id);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.get(`/fees/vouchers/${voucher.id}/reprint/`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const file = new Blob([res.data], { type: 'application/pdf' });
      window.open(URL.createObjectURL(file), '_blank');
    } catch (error) {
      console.error('Error reprinting voucher:', error);
      const status = error.response?.status;
      const text =
        status === 404
          ? 'That voucher no longer exists and cannot be reprinted.'
          : await extractBlobErrorMessage(error, 'Failed to reprint the voucher. Please try again.');
      setMessage({ type: 'error', text });
    } finally {
      setReprintingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl">
        <form onSubmit={handleSearch} className="flex items-end gap-4">
          <Field label="GR No" hint="Search a student to see and manage every month's voucher status.">
            <input
              type="text"
              value={grNo}
              onChange={(e) => setGrNo(e.target.value)}
              placeholder="e.g. 2021-045"
              required
              className={inputClass}
            />
          </Field>
          <button type="submit" disabled={loading} className={primaryBtnClass}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      <Message message={message} />

      {student && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">GR No</p>
              <p className="font-medium">{student.gr_no}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Name</p>
              <p className="font-medium">{student.full_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Father Name</p>
              <p className="font-medium">{student.father_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Class</p>
              <p className="font-medium">
                {student.student_class?.display_name || student.student_class?.name || '—'}
              </p>
            </div>
          </div>

          {student.fee_vouchers?.length === 0 ? (
            <EmptyState text="No fee vouchers have been generated for this student yet." />
          ) : (
            <TableShell headers={['Challan No', 'Month/Year', 'Due Date', 'Status', 'Paid At', 'Action']}>
              {student.fee_vouchers.map((v) => (
                <tr key={v.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3">{v.challan_no}</td>
                  <td className="px-4 py-3">{MONTH_NAMES[v.month - 1]} {v.year}</td>
                  <td className="px-4 py-3">{formatDate(v.due_date)}</td>
                  <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(v.paid_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleStatus(v)}
                        disabled={updatingId === v.id}
                        className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)] hover:text-[var(--quinary)] disabled:opacity-50 cursor-pointer"
                      >
                        {updatingId === v.id
                          ? 'Updating...'
                          : v.status === 'PAID'
                          ? 'Mark Pending'
                          : 'Mark Paid'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReprint(v)}
                        disabled={reprintingId === v.id}
                        className="text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-[var(--quinary)] disabled:opacity-50 cursor-pointer"
                      >
                        {reprintingId === v.id ? 'Reprinting...' : 'Reprint'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </div>
      )}
    </div>
  );
};

export default Fee_Reports;