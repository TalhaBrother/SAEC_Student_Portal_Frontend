import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import api from "../api/axios";
import useAuthStore from "../store/authStore";
import Swal from "sweetalert2";

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

const todayISO = () => new Date().toISOString().split("T")[0];

// Student/class relations sometimes come back as a plain id and
// sometimes as a nested { id, name } object depending on the
// serializer — normalize both so filtering never silently breaks.
const idOf = (val) => {
    if (val === null || val === undefined) return null;
    return typeof val === "object" ? val.id : val;
};
const nameOf = (val) => {
    if (val === null || val === undefined) return null;
    return typeof val === "object" ? val.name ?? val.display_name ?? null : null;
};

const authHeaders = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// Pulls a readable message out of a failed axios call. Handles the
// PDF endpoints too, where an error response comes back as a Blob
// (since the success path expects binary PDF data) instead of JSON.
async function extractErrorMessage(err) {
    try {
        const data = err?.response?.data;
        if (data instanceof Blob) {
            const text = await data.text();
            try {
                return JSON.parse(text).error || text;
            } catch {
                return text || "Request failed.";
            }
        }
        return data?.error || err?.message || "Something went wrong.";
    } catch {
        return "Something went wrong.";
    }
}

function toast(icon, text, title) {
    Swal.fire({
        title: title || (icon === "success" ? "Success!" : "Heads up"),
        text,
        icon,
        confirmButtonText: "OK",
        confirmButtonColor: "var(--primary)",
        background: "var(--secondary)",
        color: "var(--quinary)",
    });
}

const STATUS_STYLES = {
    PRESENT: "bg-[var(--success)] border-[var(--success)] text-[var(--surface)] shadow-sm",
    ABSENT: "bg-[var(--danger)] border-[var(--danger)] text-[var(--surface)] shadow-sm",
};
const STATUS_IDLE = "bg-[var(--surface)] border-[var(--neutral-200)] text-[var(--neutral-600)] hover:bg-[var(--neutral-50)]";

const inputClass =
    "bg-[var(--surface)] text-[var(--quinary)] border border-[var(--neutral-300)] rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm";
const labelClass = "text-xs uppercase tracking-wider text-[var(--neutral-500)] font-semibold mb-1";

const ATTENDANCE_MODES = [
    { key: "student", label: "Student Attendance" },
    { key: "teacher", label: "Teacher Attendance" },
    { key: "qr", label: "QR Attendance" },
];

const STUDENT_TABS = [
    { key: "mark", label: "Mark Attendance" },
    { key: "records", label: "Records" },
    { key: "student", label: "Student Analytics" },
    { key: "class", label: "Class Analytics" },
];

const TEACHER_TABS = [
    { key: "mark", label: "Mark Attendance" },
    { key: "records", label: "Records" },
    { key: "analytics", label: "Analytics" },
];

// Kept for compatibility with anything referencing the old name.
const TABS = STUDENT_TABS;

/* ------------------------------------------------------------------ */
/*  Root component                                                     */
/* ------------------------------------------------------------------ */

const Attendance = () => {
    const token = useAuthStore((state) => state.accessToken);

    // Top-level split: which roster this screen is working with. Each side
    // keeps its own tab selection so switching back and forth doesn't lose
    // your place.
    const [mode, setMode] = useState("student");
    const [activeStudentTab, setActiveStudentTab] = useState("mark");
    const [activeTeacherTab, setActiveTeacherTab] = useState("mark");

    const [Students, setStudents] = useState([]);
    const [Classes, setClasses] = useState([]);
    const [Teachers, setTeachers] = useState([]);

    useEffect(() => {
        if (!token) return;

        api.get("/students/", authHeaders(token))
            .then((res) => setStudents(res.data))
            .catch((err) => console.error("Failed to load students:", err));

        api.get("/classes/", authHeaders(token))
            .then((res) => setClasses(res.data))
            .catch((err) => console.error("Failed to load classes:", err));

        api.get("/teachers/", authHeaders(token))
            .then((res) => setTeachers(Array.isArray(res.data) ? res.data : res.data?.results || []))
            .catch((err) => console.error("Failed to load teachers:", err));
    }, [token]);

    // Section / group options for a given class, derived from the
    // student roster instead of a dedicated endpoint (none is
    // documented), keyed with real ids so they can drive section_id /
    // group_id query params.
    const sectionOptionsFor = (classId) => {
        if (!classId) return [];
        const seen = new Map();
        Students.filter((s) => idOf(s.student_class) === Number(classId)).forEach((s) => {
            const id = idOf(s.section);
            const name = nameOf(s.section);
            if (id && name && !seen.has(id)) seen.set(id, name);
        });
        return Array.from(seen, ([id, name]) => ({ id, name }));
    };
    const groupOptionsFor = (classId) => {
        if (!classId) return [];
        const seen = new Map();
        Students.filter((s) => idOf(s.student_class) === Number(classId)).forEach((s) => {
            const id = idOf(s.group);
            const name = nameOf(s.group);
            if (id && name && !seen.has(id)) seen.set(id, name);
        });
        return Array.from(seen, ([id, name]) => ({ id, name }));
    };

    const tabs = mode === "student" ? STUDENT_TABS : mode === "teacher" ? TEACHER_TABS : [];
    const activeTab = mode === "student" ? activeStudentTab : activeTeacherTab;
    const setActiveTab = mode === "student" ? setActiveStudentTab : setActiveTeacherTab;

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">Attendance</div>
            <p className="text-[var(--neutral-500)] text-sm mb-6">
                Mark daily attendance, browse and edit records, and review attendance analytics — for students or
                teaching staff.
            </p>

            {/* Student / Teacher switch */}
            <div className="inline-flex items-center gap-1 bg-[var(--surface)] border border-[var(--neutral-200)] rounded-xl p-1 mb-5 shadow-sm">
                {ATTENDANCE_MODES.map((m) => (
                    <button
                        key={m.key}
                        type="button"
                        onClick={() => setMode(m.key)}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                            mode === m.key
                                ? "bg-[var(--primary)] text-[var(--surface)] shadow-sm"
                                : "text-[var(--neutral-500)] hover:text-[var(--quinary)] hover:bg-[var(--neutral-50)]"
                        }`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {/* Student / Teacher sub-tabs */}
            {mode !== "qr" && (
                <div className="flex flex-wrap gap-2 mb-6 border-b border-[var(--neutral-200)]">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-colors cursor-pointer ${
                                activeTab === tab.key
                                    ? "bg-[var(--surface)] text-[var(--primary)] border border-b-0 border-[var(--neutral-200)]"
                                    : "text-[var(--neutral-500)] hover:text-[var(--quinary)]"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {mode === "qr" && <QRAttendanceTab token={token} active={mode === "qr"} />}

            {mode === "student" && (
                <>
                    {activeTab === "mark" && (
                        <MarkAttendanceTab
                            token={token}
                            Classes={Classes}
                            sectionOptionsFor={sectionOptionsFor}
                            groupOptionsFor={groupOptionsFor}
                        />
                    )}
                    {activeTab === "records" && (
                        <RecordsTab
                            token={token}
                            Classes={Classes}
                            Students={Students}
                            sectionOptionsFor={sectionOptionsFor}
                            groupOptionsFor={groupOptionsFor}
                        />
                    )}
                    {activeTab === "student" && <StudentAnalyticsTab token={token} Students={Students} />}
                    {activeTab === "class" && (
                        <ClassAnalyticsTab
                            token={token}
                            Classes={Classes}
                            sectionOptionsFor={sectionOptionsFor}
                            groupOptionsFor={groupOptionsFor}
                        />
                    )}
                </>
            )}

            {mode === "teacher" && (
                <>
                    {activeTab === "mark" && <TeacherMarkAttendanceTab token={token} Teachers={Teachers} />}
                    {activeTab === "records" && <TeacherRecordsTab token={token} Teachers={Teachers} />}
                    {activeTab === "analytics" && <TeacherAnalyticsTab token={token} />}
                </>
            )}
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Tab 1 — Mark Attendance (class-students -> bulk)                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  QR ATTENDANCE — scan student / teacher ID cards                    */
/* ------------------------------------------------------------------ */

// ID cards encode "STUDENT:<uuid>" or "TEACHER:<uuid>" (see the ID-card
// PDF generators). The backend (/api/qr-attendance/) does the real
// validation — this prefix check only avoids spending a request (and part
// of the hourly throttle budget) on QR codes that clearly aren't ours.
const qrKindOf = (raw) => {
    const value = (raw || "").trim();
    if (value.startsWith("STUDENT:")) return "student";
    if (value.startsWith("TEACHER:")) return "teacher";
    return null;
};

const QR_CAMERA_COOLDOWN_MS = 4000; // camera keeps seeing the same card — ignore repeats
const QR_SCANNER_DEBOUNCE_MS = 1500; // hardware scanner double-trigger guard
const QR_DECODE_INTERVAL_MS = 120;
const QR_MAX_FRAME_WIDTH = 960;
const QR_LOG_LIMIT = 300;

const QR_OUTCOMES = {
    marked: { label: "Marked", dot: "bg-[var(--success)]", text: "text-[var(--success)]" },
    existing: { label: "Already recorded", dot: "bg-amber-500", text: "text-amber-600" },
    error: { label: "Failed", dot: "bg-[var(--danger)]", text: "text-[var(--danger)]" },
    undone: { label: "Undone", dot: "bg-[var(--neutral-400)]", text: "text-[var(--neutral-400)]" },
};

const QR_TONES = {
    success: { box: "border-[var(--success)] bg-[var(--success)]/10", title: "text-[var(--success)]" },
    warning: { box: "border-amber-500 bg-amber-500/10", title: "text-amber-600" },
    error: { box: "border-[var(--danger)] bg-[var(--danger)]/10", title: "text-[var(--danger)]" },
};

const formatClock = (d) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// The QR endpoints report problems as { detail }, and a frozen student /
// inactive teacher response also carries the person's name + id, so the
// error card can say *who* was rejected.
function describeQRError(err) {
    const res = err?.response;
    const data = res?.data;

    let message;
    if (!res) {
        message = "Cannot reach the server. Check the connection and try again.";
    } else if (data && typeof data === "object") {
        message = data.detail || data.error || data.message;
    } else if (typeof data === "string" && data.length < 200) {
        message = data;
    }
    message = message || err?.message || "Request failed.";

    let title = "Scan failed";
    if (res?.status === 404) title = "QR code not recognised";
    else if (res?.status === 429) title = "Too many requests";
    else if (res?.status === 401 || res?.status === 403) title = "Not allowed";
    else if (res?.status === 400 && data?.name) title = "Attendance not marked";
    else if (res?.status === 400) title = "Invalid QR code";

    return {
        title,
        message,
        type: data?.type || null,
        name: data?.name || null,
        externalId: data?.student_id || data?.teacher_id || null,
    };
}

// Short beep + vibration so staff can scan without watching the screen.
function useScanFeedback(enabled) {
    const ctxRef = useRef(null);

    useEffect(
        () => () => {
            try {
                ctxRef.current?.close?.();
            } catch {
                /* ignore */
            }
        },
        []
    );

    return useCallback(
        (kind) => {
            if (!enabled) return;
            try {
                navigator.vibrate?.(kind === "success" ? 60 : [80, 60, 80]);
            } catch {
                /* ignore */
            }
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                if (!ctxRef.current) ctxRef.current = new AudioCtx();
                const ctx = ctxRef.current;
                if (ctx.state === "suspended") ctx.resume();

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const length = kind === "success" ? 0.14 : 0.3;
                osc.type = "sine";
                osc.frequency.value = kind === "success" ? 880 : kind === "warning" ? 620 : 240;
                gain.gain.setValueAtTime(0.0001, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + length);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + length + 0.02);
            } catch {
                /* audio is best-effort */
            }
        },
        [enabled]
    );
}

function QRTypeBadge({ type }) {
    if (!type) return null;
    return (
        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)]">
            {type}
        </span>
    );
}

function QRResultCard({ result }) {
    const tone = QR_TONES[result.tone] || QR_TONES.error;
    return (
        <div className={`rounded-2xl border-2 p-5 ${tone.box}`}>
            <div className="flex items-start justify-between gap-3">
                <div className={`text-xl font-bold ${tone.title}`}>{result.title}</div>
                <div className="text-xs text-[var(--neutral-500)] whitespace-nowrap">{formatClock(result.at)}</div>
            </div>

            {(result.name || result.externalId) && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-semibold text-[var(--quinary)]">{result.name || "Unknown"}</span>
                    <QRTypeBadge type={result.type} />
                </div>
            )}
            {result.externalId && <div className="text-sm text-[var(--neutral-500)]">{result.externalId}</div>}
            {result.meta && <div className="text-sm text-[var(--neutral-500)]">{result.meta}</div>}
            <div className="mt-2 text-sm text-[var(--quinary)]">{result.message}</div>
        </div>
    );
}

// Review-first mode: result of POST /qr-attendance/scan/ (lookup only),
// waiting for the operator to confirm before anything is written.
function QRPreviewCard({ person, busy, onConfirm, onDiscard }) {
    const isStudent = person.type === "student";
    const blocked = isStudent ? person.is_frozen : person.is_active === false;
    const blockedText = isStudent
        ? "This student's account is frozen — attendance can't be marked."
        : "This teacher is inactive — attendance can't be marked.";

    const lines = isStudent
        ? [
              person.student_id,
              person.father_name && `Father: ${person.father_name}`,
              [person.class, person.board].filter(Boolean).join(" · "),
              person.section && `Section: ${person.section}`,
              person.group && `Group: ${person.group}`,
          ]
        : [person.teacher_id, person.father_name && `Father: ${person.father_name}`, person.phone];

    return (
        <div className="rounded-2xl border-2 border-[var(--primary)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="text-xs uppercase tracking-wider font-semibold text-[var(--neutral-500)] mb-2">
                Review before marking
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold text-[var(--quinary)]">{person.name}</span>
                <QRTypeBadge type={person.type} />
            </div>
            <div className="mt-1 space-y-0.5">
                {lines.filter(Boolean).map((line, i) => (
                    <div key={i} className="text-sm text-[var(--neutral-500)]">
                        {line}
                    </div>
                ))}
            </div>

            {blocked && (
                <div className="mt-3 text-sm font-medium text-[var(--danger)] bg-[var(--danger)]/10 rounded-xl p-3">
                    {blockedText}
                </div>
            )}

            <div className="mt-4 flex gap-3">
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy || blocked}
                    className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-[var(--surface)] font-medium py-2.5 px-5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                    {busy ? "Marking..." : "Mark present"}
                </button>
                <button
                    type="button"
                    onClick={onDiscard}
                    disabled={busy}
                    className="border border-[var(--neutral-300)] text-[var(--neutral-600)] font-medium py-2.5 px-5 rounded-xl hover:bg-[var(--neutral-50)] transition-colors cursor-pointer disabled:opacity-50"
                >
                    Discard
                </button>
            </div>
        </div>
    );
}

function QRAttendanceTab({ token, active }) {
    // Camera needs a secure context (HTTPS or localhost). When the app is
    // opened over plain http://<lan-ip>, browsers block it — the hardware
    // scanner input keeps working in that case.
    const canUseCamera =
        typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

    const [inputMethod, setInputMethod] = useState(canUseCamera ? "camera" : "scanner");
    const [autoMark, setAutoMark] = useState(true);
    const [soundOn, setSoundOn] = useState(true);

    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState(null); // review-first preview
    const [lastResult, setLastResult] = useState(null);
    const [log, setLog] = useState([]);
    const [serverDate, setServerDate] = useState("");
    const [undoingKey, setUndoingKey] = useState(null);

    const [manualValue, setManualValue] = useState("");

    const [logSearch, setLogSearch] = useState("");
    const [logType, setLogType] = useState("all");
    const [logOutcome, setLogOutcome] = useState("all");

    const [cameraOn, setCameraOn] = useState(false);
    const [cameraError, setCameraError] = useState("");
    const [devices, setDevices] = useState([]);
    const [deviceId, setDeviceId] = useState("");

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const detectorRef = useRef(null);
    const scannerInputRef = useRef(null);

    const busyRef = useRef(false);
    const queueRef = useRef([]);
    const recentRef = useRef(new Map()); // payload -> last accepted timestamp
    const handleScanRef = useRef(null);
    const pendingRef = useRef(null);

    const feedback = useScanFeedback(soundOn);

    useEffect(() => {
        pendingRef.current = pending;
    }, [pending]);

    /* ---------------------------- logging ---------------------------- */

    const pushLog = (entry) => {
        setLog((prev) => [entry, ...prev].slice(0, QR_LOG_LIMIT));
    };

    const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    /* ------------------------- request handling ---------------------- */

    const reportError = (err, payload, at) => {
        const info = describeQRError(err);
        setPending(null);
        setLastResult({
            tone: "error",
            title: info.title,
            message: info.message,
            type: info.type,
            name: info.name,
            externalId: info.externalId,
            at,
        });
        pushLog({
            key: newKey(),
            at,
            payload,
            type: info.type,
            name: info.name || "Unknown code",
            externalId: info.externalId || "",
            outcome: "error",
            message: info.message,
        });
        feedback("error");
    };

    // Shared by auto-mark and review-confirm. created === false means a
    // record for today already existed — the backend then overwrites its
    // status to PRESENT, so we flag it instead of showing plain success.
    const recordMarkResult = (data, payload, at, meta) => {
        const existing = data.created === false;
        const externalId = data.type === "teacher" ? data.teacher_id : data.student_id;

        if (data.date) setServerDate(data.date);

        setLastResult({
            tone: existing ? "warning" : "success",
            title: existing ? "Already recorded today" : "Marked present",
            message: existing
                ? "A record for today already existed — it is now set to PRESENT."
                : `Attendance saved for ${data.date}.`,
            type: data.type,
            name: data.name,
            externalId,
            meta,
            at,
        });
        pushLog({
            key: newKey(),
            at,
            payload,
            type: data.type,
            name: data.name,
            externalId,
            meta,
            outcome: existing ? "existing" : "marked",
            created: data.created,
            attendanceId: data.attendance_id,
            message: existing ? "Record already existed — set to PRESENT." : "Marked present.",
        });
        feedback(existing ? "warning" : "success");
    };

    const handleScan = async (raw) => {
        const payload = (raw || "").trim();
        if (!payload) return;
        const at = new Date();

        if (!qrKindOf(payload)) {
            setPending(null);
            setLastResult({
                tone: "error",
                title: "Invalid QR code",
                message: "This isn't a student or teacher attendance QR code.",
                at,
            });
            pushLog({
                key: newKey(),
                at,
                payload,
                type: null,
                name: "Unknown code",
                externalId: payload.slice(0, 24),
                outcome: "error",
                message: "Not an attendance QR code.",
            });
            feedback("error");
            return;
        }

        try {
            if (autoMark) {
                const res = await api.post("/qr-attendance/mark/", { qr_data: payload }, authHeaders(token));
                setPending(null);
                recordMarkResult(res.data, payload, at);
            } else {
                const res = await api.post("/qr-attendance/scan/", { qr_data: payload }, authHeaders(token));
                setLastResult(null);
                setPending({ ...res.data, qr_data: payload });
                feedback("success");
            }
        } catch (err) {
            reportError(err, payload, at);
        }
    };

    // Always points at the newest closure so the camera loop never sees
    // stale settings (auto-mark toggle, token).
    useEffect(() => {
        handleScanRef.current = handleScan;
    });

    // One request at a time; anything that arrives meanwhile (a hardware
    // scanner can fire several cards quickly) waits in line.
    const drainQueue = async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
            while (queueRef.current.length) {
                const next = queueRef.current.shift();
                await handleScanRef.current(next);
            }
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const enqueue = (payload) => {
        queueRef.current.push(payload);
        drainQueue();
    };

    const isRecentDuplicate = (payload, windowMs) => {
        const now = Date.now();
        const last = recentRef.current.get(payload);
        if (last && now - last < windowMs) return true;
        recentRef.current.set(payload, now);

        if (recentRef.current.size > 200) {
            for (const [key, time] of recentRef.current) {
                if (now - time > QR_CAMERA_COOLDOWN_MS) recentRef.current.delete(key);
            }
        }
        return false;
    };

    const confirmPending = async () => {
        if (!pending || busyRef.current) return;
        const payload = pending.qr_data;
        const meta =
            pending.type === "student"
                ? [pending.class, pending.section && `Section ${pending.section}`, pending.group]
                      .filter(Boolean)
                      .join(" · ")
                : undefined;
        const at = new Date();

        busyRef.current = true;
        setBusy(true);
        try {
            const res = await api.post("/qr-attendance/mark/", { qr_data: payload }, authHeaders(token));
            setPending(null);
            recordMarkResult(res.data, payload, at, meta);
        } catch (err) {
            reportError(err, payload, at);
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const discardPending = () => {
        if (pending) recentRef.current.delete(pending.qr_data); // allow an immediate re-scan
        setPending(null);
    };

    /* ------------------------ hardware scanner ------------------------ */

    const submitManual = () => {
        const value = manualValue.trim();
        if (!value) return;
        setManualValue("");
        if (!isRecentDuplicate(value, QR_SCANNER_DEBOUNCE_MS)) enqueue(value);
        scannerInputRef.current?.focus();
    };

    /* ----------------------------- camera ----------------------------- */

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraOn(false);
    }, []);

    const startCamera = async (preferredId) => {
        setCameraError("");
        if (!canUseCamera) {
            setCameraError("Camera access needs HTTPS (or localhost). Use the scanner input instead.");
            return;
        }
        stopCamera();

        try {
            const video = preferredId
                ? { deviceId: { exact: preferredId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } };
            const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });

            const el = videoRef.current;
            if (!el) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            streamRef.current = stream;
            el.srcObject = stream;
            await el.play();

            // Prefer the browser's native QR detector (faster, better on
            // small printed cards); jsQR is the fallback everywhere else.
            detectorRef.current = null;
            if ("BarcodeDetector" in window) {
                try {
                    const formats = await window.BarcodeDetector.getSupportedFormats();
                    if (formats.includes("qr_code")) {
                        detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
                    }
                } catch {
                    detectorRef.current = null;
                }
            }

            setCameraOn(true);

            // Device labels are only available after permission is granted.
            const all = await navigator.mediaDevices.enumerateDevices();
            setDevices(all.filter((d) => d.kind === "videoinput"));
            const activeId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
            if (activeId) setDeviceId(activeId);
        } catch (err) {
            stopCamera();
            const name = err?.name;
            if (name === "NotAllowedError" || name === "SecurityError") {
                setCameraError("Camera permission was denied. Allow camera access in the browser and try again.");
            } else if (name === "NotFoundError" || name === "OverconstrainedError") {
                setCameraError("No matching camera was found on this device.");
            } else if (name === "NotReadableError") {
                setCameraError("The camera is being used by another app or tab.");
            } else {
                setCameraError(err?.message || "Could not start the camera.");
            }
        }
    };

    // Decode loop — runs only while the camera is on.
    useEffect(() => {
        if (!cameraOn) return undefined;

        let stopped = false;
        let rafId = 0;
        let lastTick = 0;
        let decoding = false;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const decodeFrame = async (video) => {
            if (detectorRef.current) {
                const found = await detectorRef.current.detect(video);
                return found?.[0]?.rawValue || null;
            }
            const scale = Math.min(1, QR_MAX_FRAME_WIDTH / video.videoWidth);
            const w = Math.max(1, Math.floor(video.videoWidth * scale));
            const h = Math.max(1, Math.floor(video.videoHeight * scale));
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const image = ctx.getImageData(0, 0, w, h);
            return jsQR(image.data, w, h, { inversionAttempts: "dontInvert" })?.data || null;
        };

        const tick = async (time) => {
            if (stopped) return;
            rafId = requestAnimationFrame(tick);

            if (decoding || time - lastTick < QR_DECODE_INTERVAL_MS) return;
            lastTick = time;

            const video = videoRef.current;
            if (!video || video.readyState < 2 || !video.videoWidth) return;
            // Review-first mode: hold still while a preview waits for a decision.
            if (pendingRef.current) return;

            decoding = true;
            try {
                const value = await decodeFrame(video);
                if (value && !busyRef.current && queueRef.current.length === 0) {
                    if (!isRecentDuplicate(value, QR_CAMERA_COOLDOWN_MS)) enqueue(value);
                }
            } catch {
                /* a bad frame is not worth surfacing */
            } finally {
                decoding = false;
            }
        };

        rafId = requestAnimationFrame(tick);
        return () => {
            stopped = true;
            cancelAnimationFrame(rafId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cameraOn]);

    // Camera off when leaving the QR mode, switching input method, or unmounting.
    useEffect(() => {
        if (!active || inputMethod !== "camera") stopCamera();
        if (active && inputMethod === "scanner") scannerInputRef.current?.focus();
    }, [active, inputMethod, stopCamera]);

    useEffect(() => stopCamera, [stopCamera]);

    /* ------------------------------ undo ------------------------------ */

    // Only offered for records this scan *created* — deleting restores the
    // pre-scan state. (If the record already existed we can't know what it
    // held before, so that's left to the Records tab.)
    const undoEntry = async (entry) => {
        const confirm = await Swal.fire({
            title: "Undo this scan?",
            text: `${entry.name} — the attendance record created by this scan will be deleted.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Undo scan",
            confirmButtonColor: "var(--danger)",
            background: "var(--secondary)",
            color: "var(--quinary)",
        });
        if (!confirm.isConfirmed) return;

        setUndoingKey(entry.key);
        try {
            const path = entry.type === "teacher" ? "teacher-attendance" : "attendance";
            await api.delete(`/${path}/${entry.attendanceId}/`, authHeaders(token));
            recentRef.current.delete(entry.payload);
            setLog((prev) =>
                prev.map((e) =>
                    e.key === entry.key ? { ...e, outcome: "undone", message: "Undone — record deleted." } : e
                )
            );
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setUndoingKey(null);
        }
    };

    /* --------------------------- log filtering ------------------------- */

    const counts = useMemo(() => {
        const c = { marked: 0, existing: 0, error: 0, undone: 0, student: 0, teacher: 0 };
        log.forEach((e) => {
            c[e.outcome] = (c[e.outcome] || 0) + 1;
            if (e.type && (e.outcome === "marked" || e.outcome === "existing")) c[e.type] += 1;
        });
        return c;
    }, [log]);

    const filteredLog = useMemo(() => {
        const q = logSearch.trim().toLowerCase();
        return log.filter((e) => {
            if (logType !== "all" && e.type !== logType) return false;
            if (logOutcome !== "all" && e.outcome !== logOutcome) return false;
            if (!q) return true;
            return e.name?.toLowerCase().includes(q) || e.externalId?.toLowerCase().includes(q);
        });
    }, [log, logSearch, logType, logOutcome]);

    const clearLog = () => {
        setLog([]);
        setLastResult(null);
        recentRef.current.clear();
    };

    /* ------------------------------ render ----------------------------- */

    const segClass = (on) =>
        `px-3 py-2 text-xs font-bold uppercase rounded-lg cursor-pointer transition-colors ${
            on ? "bg-[var(--surface)] shadow-sm text-[var(--primary)]" : "text-[var(--neutral-500)]"
        }`;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            {/* ------------------------- Scanner column ------------------------- */}
            <div className="xl:col-span-2 space-y-4">
                <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 space-y-4">
                    <div className="flex flex-col">
                        <label className={labelClass}>Input method</label>
                        <div className="flex gap-1 bg-[var(--neutral-100)] rounded-xl p-1 self-start">
                            <button type="button" onClick={() => setInputMethod("camera")} className={segClass(inputMethod === "camera")}>
                                Camera
                            </button>
                            <button type="button" onClick={() => setInputMethod("scanner")} className={segClass(inputMethod === "scanner")}>
                                Scanner / keyboard
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col">
                        <label className={labelClass}>When a card is scanned</label>
                        <div className="flex gap-1 bg-[var(--neutral-100)] rounded-xl p-1 self-start">
                            <button type="button" onClick={() => setAutoMark(true)} className={segClass(autoMark)}>
                                Mark present instantly
                            </button>
                            <button type="button" onClick={() => setAutoMark(false)} className={segClass(!autoMark)}>
                                Review first
                            </button>
                        </div>
                        <p className="text-xs text-[var(--neutral-400)] mt-2">
                            {autoMark
                                ? "One request per scan — best for busy entrances."
                                : "Shows the student / teacher details and waits for your confirmation (two requests per card)."}
                        </p>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-[var(--neutral-600)] cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={soundOn}
                            onChange={(e) => setSoundOn(e.target.checked)}
                            className="accent-[var(--primary)] cursor-pointer"
                        />
                        Beep / vibrate on scan
                    </label>
                </div>

                {inputMethod === "camera" ? (
                    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 space-y-3">
                        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                            {!cameraOn && (
                                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70 px-6 text-center">
                                    {canUseCamera ? "Camera is off" : "Camera isn't available on this connection"}
                                </div>
                            )}
                            {cameraOn && (
                                <div className="pointer-events-none absolute inset-8 border-2 border-white/70 rounded-2xl" />
                            )}
                            {busy && (
                                <div className="absolute top-3 right-3 text-xs font-semibold bg-black/70 text-white px-3 py-1 rounded-full">
                                    Processing...
                                </div>
                            )}
                            {cameraOn && pending && (
                                <div className="absolute bottom-3 left-3 right-3 text-xs text-center bg-black/70 text-white px-3 py-2 rounded-lg">
                                    Confirm or discard the card on the right to keep scanning.
                                </div>
                            )}
                        </div>

                        {cameraError && (
                            <div className="text-sm text-[var(--danger)] bg-[var(--danger)]/10 rounded-xl p-3">{cameraError}</div>
                        )}
                        {!canUseCamera && (
                            <div className="text-xs text-[var(--neutral-500)] bg-[var(--neutral-50)] rounded-xl p-3">
                                Browsers only allow camera access on HTTPS or localhost. Open this app over HTTPS, or switch to
                                “Scanner / keyboard” and use a USB / Bluetooth QR scanner.
                            </div>
                        )}

                        <div className="flex flex-wrap gap-3 items-center">
                            {cameraOn ? (
                                <button
                                    type="button"
                                    onClick={stopCamera}
                                    className="border border-[var(--danger)] text-[var(--danger)] font-semibold py-2.5 px-4 rounded-xl hover:bg-[var(--danger)]/5 transition-colors cursor-pointer"
                                >
                                    Stop camera
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => startCamera(deviceId)}
                                    disabled={!canUseCamera}
                                    className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-[var(--surface)] font-medium py-2.5 px-5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                                >
                                    Start camera
                                </button>
                            )}

                            {devices.length > 1 && (
                                <select
                                    value={deviceId}
                                    onChange={(e) => {
                                        setDeviceId(e.target.value);
                                        if (cameraOn) startCamera(e.target.value);
                                    }}
                                    className={`${inputClass} cursor-pointer min-w-[180px] flex-1`}
                                >
                                    {devices.map((d, i) => (
                                        <option key={d.deviceId} value={d.deviceId}>
                                            {d.label || `Camera ${i + 1}`}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 space-y-3">
                        <div className="flex flex-col">
                            <label className={labelClass}>Scan a card</label>
                            <input
                                ref={scannerInputRef}
                                type="text"
                                value={manualValue}
                                onChange={(e) => setManualValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        submitManual();
                                    }
                                }}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder="Click here, then scan… or paste STUDENT:… / TEACHER:…"
                                className={`${inputClass} font-mono`}
                            />
                        </div>
                        <p className="text-xs text-[var(--neutral-400)]">
                            USB and Bluetooth QR scanners type the code and press Enter. Keep this box focused while scanning — the
                            focus returns here after every scan.
                        </p>
                        <button
                            type="button"
                            onClick={submitManual}
                            disabled={!manualValue.trim()}
                            className="border border-[var(--primary)] text-[var(--primary)] font-semibold py-2.5 px-4 rounded-xl hover:bg-[var(--primary)]/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Submit code
                        </button>
                    </div>
                )}

                <p className="text-xs text-[var(--neutral-400)]">
                    Scans always record <span className="font-semibold">today's date on the server</span>
                    {serverDate ? ` (${serverDate})` : ""}. To mark another date, use Student / Teacher Attendance → Mark Attendance.
                </p>
            </div>

            {/* -------------------------- Result column -------------------------- */}
            <div className="xl:col-span-3 space-y-4">
                <div aria-live="polite">
                    {pending ? (
                        <QRPreviewCard person={pending} busy={busy} onConfirm={confirmPending} onDiscard={discardPending} />
                    ) : lastResult ? (
                        <QRResultCard result={lastResult} />
                    ) : (
                        <div className="rounded-2xl border-2 border-dashed border-[var(--neutral-200)] p-8 text-center text-sm text-[var(--neutral-400)]">
                            Ready to scan. Hold a student or teacher ID card up to the camera, or scan it with your QR scanner.
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Marked" value={counts.marked} accent="text-[var(--success)]" />
                    <StatCard label="Already recorded" value={counts.existing} accent="text-amber-600" />
                    <StatCard label="Failed" value={counts.error} accent="text-[var(--danger)]" />
                    <StatCard label="Total scans" value={log.length} />
                </div>

                <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4">
                    <div className="flex flex-wrap gap-3 items-end mb-3">
                        <div className="flex flex-col min-w-[180px] flex-1">
                            <label className={labelClass}>Search this session</label>
                            <input
                                type="text"
                                placeholder="Name or ID..."
                                value={logSearch}
                                onChange={(e) => setLogSearch(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div className="flex flex-col min-w-[150px]">
                            <label className={labelClass}>Type</label>
                            <select value={logType} onChange={(e) => setLogType(e.target.value)} className={`${inputClass} cursor-pointer`}>
                                <option value="all">All</option>
                                <option value="student">Students ({counts.student})</option>
                                <option value="teacher">Teachers ({counts.teacher})</option>
                            </select>
                        </div>
                        <div className="flex flex-col min-w-[160px]">
                            <label className={labelClass}>Outcome</label>
                            <select
                                value={logOutcome}
                                onChange={(e) => setLogOutcome(e.target.value)}
                                className={`${inputClass} cursor-pointer`}
                            >
                                <option value="all">All</option>
                                {Object.entries(QR_OUTCOMES).map(([key, meta]) => (
                                    <option key={key} value={key}>
                                        {meta.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={clearLog}
                            disabled={log.length === 0}
                            className="border border-[var(--neutral-300)] text-[var(--neutral-600)] text-sm font-semibold py-3 px-4 rounded-xl hover:bg-[var(--neutral-50)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Clear log
                        </button>
                    </div>

                    {filteredLog.length === 0 ? (
                        <div className="text-center py-8 text-[var(--neutral-400)] text-sm">
                            {log.length === 0 ? "Scans from this session will appear here." : "No scans match these filters."}
                        </div>
                    ) : (
                        <div className="max-h-[420px] overflow-y-auto divide-y divide-[var(--neutral-100)]">
                            {filteredLog.map((entry) => {
                                const meta = QR_OUTCOMES[entry.outcome] || QR_OUTCOMES.error;
                                return (
                                    <div key={entry.key} className="flex items-center justify-between gap-3 py-3">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${meta.dot}`} />
                                            <div className="min-w-0">
                                                <div
                                                    className={`font-semibold text-sm text-[var(--quinary)] flex items-center gap-2 flex-wrap ${
                                                        entry.outcome === "undone" ? "line-through opacity-60" : ""
                                                    }`}
                                                >
                                                    <span className="truncate">{entry.name}</span>
                                                    <QRTypeBadge type={entry.type} />
                                                </div>
                                                <div className="text-xs text-[var(--neutral-400)]">
                                                    {[entry.externalId, entry.meta].filter(Boolean).join(" · ")}
                                                </div>
                                                <div className={`text-xs ${meta.text}`}>
                                                    {meta.label}
                                                    {entry.message && entry.outcome !== "marked" ? ` — ${entry.message}` : ""}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="text-xs text-[var(--neutral-400)]">{formatClock(entry.at)}</span>
                                            {entry.outcome === "marked" && entry.created && entry.attendanceId && (
                                                <button
                                                    type="button"
                                                    onClick={() => undoEntry(entry)}
                                                    disabled={undoingKey === entry.key}
                                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)]/5 cursor-pointer disabled:opacity-50"
                                                >
                                                    {undoingKey === entry.key ? "Undoing..." : "Undo"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MarkAttendanceTab({ token, Classes, sectionOptionsFor, groupOptionsFor }) {
    const [classId, setClassId] = useState("");
    const [date, setDate] = useState(todayISO());
    const [sectionId, setSectionId] = useState("");
    const [groupId, setGroupId] = useState("");
    const [search, setSearch] = useState("");

    const [roster, setRoster] = useState([]);
    const [className, setClassName] = useState("");
    const [rosterLoading, setRosterLoading] = useState(false);
    const [attendanceData, setAttendanceData] = useState({});
    const [saving, setSaving] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [attendanceType, setAttendanceType] = useState("class");
    const [lastSummary, setLastSummary] = useState(null);

    // Reset the section/group narrowing whenever the class changes.
    useEffect(() => {
        setSectionId("");
        setGroupId("");
    }, [classId]);

    // Load the roster (+ today's/selected date's existing status) any
    // time the class, date, section, or group filter changes.
    useEffect(() => {
        if (!classId || !token) {
            setRoster([]);
            setAttendanceData({});
            return;
        }

        setRosterLoading(true);
        setLastSummary(null);

        const params = new URLSearchParams({ class_id: classId, date });
        if (sectionId) params.set("section_id", sectionId);
        if (groupId) params.set("group_id", groupId);

        api.get(`/attendance/class-students/?${params.toString()}`, authHeaders(token))
            .then((res) => {
                setClassName(res.data.class || "");
                setRoster(res.data.students || []);
                // Pre-fill from already_marked/status; default unmarked
                // students to PRESENT so a full day can be saved in one click.
                const initial = {};
                (res.data.students || []).forEach((s) => {
                    initial[s.student_db_id] = s.status || "PRESENT";
                });
                setAttendanceData(initial);
            })
            .catch(async (err) => toast("error", await extractErrorMessage(err)))
            .finally(() => setRosterLoading(false));
    }, [classId, date, sectionId, groupId, token]);

    const filteredRoster = useMemo(() => {
        if (!search.trim()) return roster;
        const q = search.trim().toLowerCase();
        return roster.filter(
            (s) => s.full_name?.toLowerCase().includes(q) || s.student_id?.toLowerCase().includes(q)
        );
    }, [roster, search]);

    const markStatus = (studentDbId, status) => {
        setAttendanceData((prev) => ({ ...prev, [studentDbId]: status }));
    };

    const markAllVisible = (status) => {
        setAttendanceData((prev) => {
            const next = { ...prev };
            filteredRoster.forEach((s) => {
                next[s.student_db_id] = status;
            });
            return next;
        });
    };

    const submitAttendance = async () => {
        if (!classId) return toast("warning", "Please select a class before saving attendance!");
        if (!date) return toast("warning", "Please select a date before saving attendance!");

        const records = roster.map((s) => ({
            student_id: s.student_db_id,
            status: attendanceData[s.student_db_id] || "PRESENT",
        }));

        if (records.length === 0) return toast("warning", "There are no students to mark for this selection.");

        setSaving(true);
        try {
            const payload = { class_id: Number(classId), date, records };
            if (sectionId) payload.section_id = Number(sectionId);
            if (groupId) payload.group_id = Number(groupId);

            const res = await api.post("/attendance/bulk/", payload, authHeaders(token));
            setLastSummary(res.data);
            toast(
                "success",
                `Created ${res.data.created}, updated ${res.data.updated} record(s) for ${date}. Parent notifications are being sent in the background.`
            );
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const printAttendanceSheet = async () => {
        if (!classId) return toast("warning", "Please select a class before generating the attendance sheet!");
        if (!date) return toast("warning", "Please select a date before generating the attendance sheet!");

        setPdfLoading(true);

        // Open the tab immediately so popup blockers do not prevent the
        // browser from displaying the generated PDF.
        const printWindow = window.open("", "_blank");

        try {
            const params = new URLSearchParams({
                class_id: classId,
                date,
                attendance_type: attendanceType,
            });

            if (sectionId) params.set("section_id", sectionId);
            if (groupId) params.set("group_id", groupId);

            const res = await api.get(`/attendance/attendance-sheet/?${params.toString()}`, {
                ...authHeaders(token),
                responseType: "blob",
            });

            const blob = new Blob([res.data], { type: "application/pdf" });
            const objectUrl = URL.createObjectURL(blob);

            if (printWindow) {
                printWindow.location.href = objectUrl;
            } else {
                window.location.href = objectUrl;
            }

            // Keep the blob alive long enough for the PDF viewer to load it.
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);

            toast("success", `Attendance sheet generated for ${date}.`);
        } catch (err) {
            if (printWindow && !printWindow.closed) printWindow.close();
            toast("error", await extractErrorMessage(err));
        } finally {
            setPdfLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row gap-4 mb-4 items-end flex-wrap">
                <div className="flex flex-col min-w-[200px]">
                    <label className={labelClass}>Class</label>
                    <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${inputClass} cursor-pointer`}>
                        <option value="">Select Class</option>
                        {Classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                                {cls.display_name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col min-w-[180px]">
                    <label className={labelClass}>Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} cursor-pointer`} />
                </div>

                <div className="flex flex-col min-w-[170px]">
                    <label className={labelClass}>Attendance Type</label>
                    <select
                        value={attendanceType}
                        onChange={(e) => setAttendanceType(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="class">Class Attendance</option>
                        <option value="exam">Exam Attendance</option>
                    </select>
                </div>

                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Section</label>
                    <select
                        value={sectionId}
                        onChange={(e) => setSectionId(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All sections</option>
                        {sectionOptionsFor(classId).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Group</label>
                    <select
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All groups</option>
                        {groupOptionsFor(classId).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col min-w-[220px] flex-1">
                    <label className={labelClass}>Search roster</label>
                    <input
                        type="text"
                        placeholder="Name or student ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} disabled:opacity-50`}
                    />
                </div>
            </div>

            {classId && (
                <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 mb-4 flex flex-wrap justify-between items-center gap-3">
                    <div>
                        <div className="text-sm font-semibold text-[var(--quinary)]">Daily Attendance Sheet</div>
                        <div className="text-xs text-[var(--neutral-400)]">
                            {date} · {attendanceType === "class" ? "Class Attendance" : "Exam Attendance"}
                            {sectionId ? " · Selected Section" : " · All Sections"}
                            {groupId ? " · Selected Group" : " · All Groups"}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={printAttendanceSheet}
                        disabled={pdfLoading || rosterLoading}
                        className="border border-[var(--primary)] text-[var(--primary)] font-semibold py-2.5 px-4 rounded-xl hover:bg-[var(--primary)]/10 transition-colors cursor-pointer disabled:opacity-50"
                    >
                        {pdfLoading ? "Preparing Sheet..." : "Print Attendance Sheet"}
                    </button>
                </div>
            )}

            {classId && filteredRoster.length > 0 && (
                <div className="flex justify-between items-center mb-3">
                    <div className="text-sm text-[var(--neutral-500)]">
                        {className} &middot; {filteredRoster.length} student{filteredRoster.length !== 1 ? "s" : ""}
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => markAllVisible("PRESENT")}
                            className="text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg border border-[var(--success)] text-[var(--success)] hover:bg-[var(--success)]/5 cursor-pointer"
                        >
                            Mark all present
                        </button>
                        <button
                            type="button"
                            onClick={() => markAllVisible("ABSENT")}
                            className="text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)]/5 cursor-pointer"
                        >
                            Mark all absent
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-6 space-y-4">
                {rosterLoading ? (
                    <div className="text-center py-8 text-[var(--neutral-400)] text-sm">Loading roster...</div>
                ) : classId && filteredRoster.length > 0 ? (
                    filteredRoster.map((student) => {
                        const currentStatus = attendanceData[student.student_db_id] || "PRESENT";
                        return (
                            <div
                                key={student.student_db_id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--neutral-100)] pb-4 last:border-0 last:pb-0 gap-3"
                            >
                                <div className="min-w-[220px]">
                                    <div className="font-semibold text-base text-[var(--quinary)]">{student.full_name}</div>
                                    <div className="text-xs text-[var(--neutral-400)]">
                                        {student.student_id}
                                        {student.section ? ` · ${student.section}` : ""}
                                        {student.group ? ` · ${student.group}` : ""}
                                        {student.already_marked && <span className="text-[var(--primary)]"> · already marked</span>}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => markStatus(student.student_db_id, "PRESENT")}
                                        className={`px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-xl border transition-all duration-200 cursor-pointer ${
                                            currentStatus === "PRESENT" ? STATUS_STYLES.PRESENT : STATUS_IDLE
                                        }`}
                                    >
                                        Present
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => markStatus(student.student_db_id, "ABSENT")}
                                        className={`px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-xl border transition-all duration-200 cursor-pointer ${
                                            currentStatus === "ABSENT" ? STATUS_STYLES.ABSENT : STATUS_IDLE
                                        }`}
                                    >
                                        Absent
                                    </button>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-8 text-[var(--neutral-400)] text-sm">
                        {classId ? "No students match this selection." : "Choose a class above to load its roster."}
                    </div>
                )}
            </div>

            {classId && filteredRoster.length > 0 && (
                <div className="mt-6 flex justify-end">
                    <button
                        type="button"
                        onClick={submitAttendance}
                        disabled={saving}
                        className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-[var(--surface)] font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
                    >
                        {saving ? "Processing Records..." : "Save Attendance"}
                    </button>
                </div>
            )}

            {lastSummary && (
                <div className="mt-4 text-xs text-[var(--neutral-500)] bg-[var(--surface)] border border-[var(--neutral-200)] rounded-xl p-3">
                    Last save: {lastSummary.created} created, {lastSummary.updated} updated for {className || lastSummary.class}.
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Tab 2 — Records (search/filter, inline edit, delete, quick add)    */
/* ------------------------------------------------------------------ */

function RecordsTab({ token, Classes, Students, sectionOptionsFor, groupOptionsFor }) {
    const [filters, setFilters] = useState({
        search: "",
        class_id: "",
        section_id: "",
        group_id: "",
        date: "",
        month: "",
    });
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);

    const setFilter = (key, val) => setFilters((prev) => ({ ...prev, [key]: val }));

    const fetchRecords = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, val]) => {
                if (val) params.set(key, val);
            });
            const res = await api.get(`/attendance/?${params.toString()}`, authHeaders(token));
            setRecords(res.data);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const updateStatus = async (record, status) => {
        if (record.status === status) return;
        setBusyId(record.id);
        try {
            await api.patch(`/attendance/${record.id}/`, { status }, authHeaders(token));
            setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, status } : r)));
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const deleteRecord = async (record) => {
        const confirm = await Swal.fire({
            title: "Delete this record?",
            text: `${record.student_name} · ${record.date}`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
            confirmButtonColor: "var(--danger)",
            background: "var(--secondary)",
            color: "var(--quinary)",
        });
        if (!confirm.isConfirmed) return;

        setBusyId(record.id);
        try {
            await api.delete(`/attendance/${record.id}/`, authHeaders(token));
            setRecords((prev) => prev.filter((r) => r.id !== record.id));
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            {/* Filters */}
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
                <div className="flex flex-col min-w-[200px] flex-1">
                    <label className={labelClass}>Search</label>
                    <input
                        type="text"
                        placeholder="Student name or ID..."
                        value={filters.search}
                        onChange={(e) => setFilter("search", e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Class</label>
                    <select
                        value={filters.class_id}
                        onChange={(e) => {
                            setFilter("class_id", e.target.value);
                            setFilter("section_id", "");
                            setFilter("group_id", "");
                        }}
                        className={`${inputClass} cursor-pointer`}
                    >
                        <option value="">All classes</option>
                        {Classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                                {cls.display_name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[140px]">
                    <label className={labelClass}>Section</label>
                    <select
                        value={filters.section_id}
                        onChange={(e) => setFilter("section_id", e.target.value)}
                        disabled={!filters.class_id}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All</option>
                        {sectionOptionsFor(filters.class_id).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[140px]">
                    <label className={labelClass}>Group</label>
                    <select
                        value={filters.group_id}
                        onChange={(e) => setFilter("group_id", e.target.value)}
                        disabled={!filters.class_id}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All</option>
                        {groupOptionsFor(filters.class_id).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[150px]">
                    <label className={labelClass}>Date</label>
                    <input type="date" value={filters.date} onChange={(e) => setFilter("date", e.target.value)} className={inputClass} />
                </div>
                <div className="flex flex-col min-w-[150px]">
                    <label className={labelClass}>Month</label>
                    <input type="month" value={filters.month} onChange={(e) => setFilter("month", e.target.value)} className={inputClass} />
                </div>
                <button
                    type="button"
                    onClick={fetchRecords}
                    className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-[var(--surface)] font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer"
                >
                    Apply
                </button>
                <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="border border-[var(--primary)] text-[var(--primary)] font-medium py-3 px-5 rounded-xl hover:bg-[var(--primary)]/10 transition-colors cursor-pointer"
                >
                    {showAddForm ? "Cancel" : "+ Add record"}
                </button>
            </div>

            {showAddForm && (
                <QuickAddRecord
                    token={token}
                    Classes={Classes}
                    Students={Students}
                    onCreated={(created) => {
                        setRecords((prev) => [created, ...prev]);
                        setShowAddForm(false);
                    }}
                />
            )}

            {/* Results table */}
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-[var(--neutral-500)] border-b border-[var(--neutral-100)]">
                            <th className="p-3">Student</th>
                            <th className="p-3">Class</th>
                            <th className="p-3">Section / Group</th>
                            <th className="p-3">Date</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-[var(--neutral-400)]">
                                    Loading records...
                                </td>
                            </tr>
                        ) : records.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-[var(--neutral-400)]">
                                    No attendance records match these filters.
                                </td>
                            </tr>
                        ) : (
                            records.map((record) => (
                                <tr key={record.id} className="border-b border-[var(--neutral-50)] last:border-0">
                                    <td className="p-3">
                                        <div className="font-semibold">{record.student_name}</div>
                                        <div className="text-xs text-[var(--neutral-400)]">{record.student_id}</div>
                                    </td>
                                    <td className="p-3">{record.class_name}</td>
                                    <td className="p-3 text-xs text-[var(--neutral-500)]">
                                        {record.section || "—"} / {record.group || "—"}
                                    </td>
                                    <td className="p-3">{record.date}</td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={busyId === record.id}
                                                onClick={() => updateStatus(record, "PRESENT")}
                                                className={`px-3 py-1 text-xs font-bold uppercase rounded-lg border cursor-pointer disabled:opacity-50 ${
                                                    record.status === "PRESENT" ? STATUS_STYLES.PRESENT : STATUS_IDLE
                                                }`}
                                            >
                                                Present
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busyId === record.id}
                                                onClick={() => updateStatus(record, "ABSENT")}
                                                className={`px-3 py-1 text-xs font-bold uppercase rounded-lg border cursor-pointer disabled:opacity-50 ${
                                                    record.status === "ABSENT" ? STATUS_STYLES.ABSENT : STATUS_IDLE
                                                }`}
                                            >
                                                Absent
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button
                                            type="button"
                                            disabled={busyId === record.id}
                                            onClick={() => deleteRecord(record)}
                                            className="text-xs font-semibold text-[var(--danger)] hover:text-[var(--danger)] cursor-pointer disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function QuickAddRecord({ token, Classes, Students, onCreated }) {
    const [classId, setClassId] = useState("");
    const [studentId, setStudentId] = useState("");
    const [date, setDate] = useState(todayISO());
    const [status, setStatus] = useState("PRESENT");
    const [saving, setSaving] = useState(false);

    const classStudents = useMemo(
        () => Students.filter((s) => idOf(s.student_class) === Number(classId)),
        [Students, classId]
    );

    const submit = async () => {
        if (!classId || !studentId || !date) return toast("warning", "Class, student, and date are all required.");
        setSaving(true);
        try {
            const res = await api.post(
                "/attendance/",
                { student: Number(studentId), student_class: Number(classId), date, status },
                authHeaders(token)
            );
            onCreated(res.data);
            toast("success", "Attendance record added.");
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col min-w-[180px]">
                <label className={labelClass}>Class</label>
                <select
                    value={classId}
                    onChange={(e) => {
                        setClassId(e.target.value);
                        setStudentId("");
                    }}
                    className={`${inputClass} cursor-pointer`}
                >
                    <option value="">Select class</option>
                    {Classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                            {cls.display_name}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex flex-col min-w-[220px] flex-1">
                <label className={labelClass}>Student</label>
                <select
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    disabled={!classId}
                    className={`${inputClass} cursor-pointer disabled:opacity-50`}
                >
                    <option value="">Select student</option>
                    {classStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.full_name} ({s.student_id})
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex flex-col min-w-[150px]">
                <label className={labelClass}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div className="flex flex-col min-w-[140px]">
                <label className={labelClass}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} cursor-pointer`}>
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                </select>
            </div>
            <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-[var(--surface)] font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer"
            >
                {saving ? "Saving..." : "Add record"}
            </button>
            <p className="text-xs text-[var(--neutral-400)] w-full">
                Note: a duplicate (student, date) pair will be rejected by the backend — edit the existing record in the table instead.
            </p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Shared: period / date toggle used by both analytics tabs           */
/* ------------------------------------------------------------------ */

function PeriodToggle({ period, onPeriodChange, date, onDateChange, options }) {
    return (
        <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col">
                <label className={labelClass}>Period</label>
                <div className="flex gap-1 bg-[var(--neutral-100)] rounded-xl p-1">
                    <button
                        type="button"
                        onClick={() => onPeriodChange("")}
                        className={`px-3 py-2 text-xs font-bold uppercase rounded-lg cursor-pointer ${
                            period === "" ? "bg-[var(--surface)] shadow-sm text-[var(--primary)]" : "text-[var(--neutral-500)]"
                        }`}
                    >
                        All-time
                    </button>
                    {options.map((opt) => (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => onPeriodChange(opt)}
                            className={`px-3 py-2 text-xs font-bold uppercase rounded-lg cursor-pointer ${
                                period === opt ? "bg-[var(--surface)] shadow-sm text-[var(--primary)]" : "text-[var(--neutral-500)]"
                            }`}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex flex-col">
                <label className={labelClass}>Reference date</label>
                <input
                    type="date"
                    value={date}
                    onChange={(e) => onDateChange(e.target.value)}
                    disabled={period === ""}
                    className={`${inputClass} cursor-pointer disabled:opacity-50`}
                />
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Tab 3 — Individual student analytics                               */
/* ------------------------------------------------------------------ */

function StudentAnalyticsTab({ token, Students }) {
    const [query, setQuery] = useState("");
    const [studentId, setStudentId] = useState("");
    const [period, setPeriod] = useState("week");
    const [date, setDate] = useState(todayISO());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);

    const matches = useMemo(() => {
        if (!query.trim()) return [];
        const q = query.trim().toLowerCase();
        return Students.filter((s) => s.full_name?.toLowerCase().includes(q) || s.student_id?.toLowerCase().includes(q)).slice(0, 8);
    }, [Students, query]);

    const fetchSummary = async (id = studentId) => {
        if (!id) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (period) {
                params.set("period", period);
                params.set("date", date);
            }
            const res = await api.get(`/attendance/summary/${id}/?${params.toString()}`, authHeaders(token));
            setData(res.data);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (studentId) fetchSummary(studentId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, period, date]);

    const downloadPDF = async () => {
        if (!studentId) return;
        setPdfLoading(true);
        try {
            const params = new URLSearchParams();
            if (period) {
                params.set("period", period);
                params.set("date", date);
            }
            const res = await api.get(`/attendance/student-pdf/${studentId}/?${params.toString()}`, {
                ...authHeaders(token),
                responseType: "blob",
            });
            const blob = new Blob([res.data], { type: "application/pdf" });
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = `attendance_${studentId}.pdf`;
            link.click();
            URL.revokeObjectURL(objectUrl);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setPdfLoading(false);
        }
    };

    return (
        <div>
            {/* Student search */}
            <div className="relative mb-4 max-w-md">
                <label className={labelClass}>Find student</label>
                <input
                    type="text"
                    placeholder="Search by name or student ID..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={`${inputClass} w-full`}
                />
                {matches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-[var(--surface)] border border-[var(--neutral-200)] rounded-xl shadow-lg max-h-64 overflow-y-auto">
                        {matches.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                    setStudentId(s.id);
                                    setQuery(`${s.full_name} (${s.student_id})`);
                                }}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--neutral-50)] cursor-pointer"
                            >
                                <span className="font-semibold">{s.full_name}</span>{" "}
                                <span className="text-[var(--neutral-400)]">({s.student_id})</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {studentId && (
                <>
                    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 mb-4 flex flex-wrap justify-between items-end gap-4">
                        <PeriodToggle period={period} onPeriodChange={setPeriod} date={date} onDateChange={setDate} options={["day", "week", "month"]} />
                        <button
                            type="button"
                            onClick={downloadPDF}
                            disabled={pdfLoading}
                            className="border border-[var(--primary)] text-[var(--primary)] font-medium py-3 px-5 rounded-xl hover:bg-[var(--primary)]/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {pdfLoading ? "Preparing PDF..." : "Download PDF"}
                        </button>
                    </div>

                    {loading || !data ? (
                        <div className="text-center py-8 text-[var(--neutral-400)] text-sm">{loading ? "Loading summary..." : "No data yet."}</div>
                    ) : (
                        <StudentSummaryView data={data} />
                    )}
                </>
            )}
        </div>
    );
}

function StudentSummaryView({ data }) {
    const { student, summary, monthly_breakdown, attendance_calendar, date_range } = data;
    const months = Object.entries(monthly_breakdown || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1));

    return (
        <div>
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-5 mb-4">
                <div className="text-lg font-bold">{student.full_name}</div>
                <div className="text-xs text-[var(--neutral-400)] mb-3">
                    {student.student_id} · {student.class}
                    {student.section ? ` · ${student.section}` : ""}
                    {student.group ? ` · ${student.group}` : ""}
                </div>
                {date_range && (
                    <div className="text-xs text-[var(--neutral-400)] mb-3">
                        Showing {date_range.start} to {date_range.end}
                    </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard label="Total" value={summary.total_classes} />
                    <StatCard label="Present" value={summary.present} accent="text-[var(--success)]" />
                    <StatCard label="Absent" value={summary.absent} accent="text-[var(--danger)]" />
                    <StatCard label="Attendance %" value={`${summary.attendance_percentage}%`} accent="text-[var(--primary)]" />
                </div>
            </div>

            {months.length > 0 && (
                <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-5 mb-4 overflow-x-auto">
                    <div className="text-sm font-bold mb-3">Monthly breakdown</div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wider text-[var(--neutral-500)] border-b border-[var(--neutral-100)]">
                                <th className="p-2">Month</th>
                                <th className="p-2">Present</th>
                                <th className="p-2">Absent</th>
                                <th className="p-2">Total</th>
                                <th className="p-2">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {months.map(([month, stats]) => (
                                <tr key={month} className="border-b border-[var(--neutral-50)] last:border-0">
                                    <td className="p-2 font-medium">{month}</td>
                                    <td className="p-2 text-[var(--success)]">{stats.present}</td>
                                    <td className="p-2 text-[var(--danger)]">{stats.absent}</td>
                                    <td className="p-2">{stats.total}</td>
                                    <td className="p-2">{stats.percentage}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {attendance_calendar?.length > 0 && (
                <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-5">
                    <div className="text-sm font-bold mb-3">Day-by-day</div>
                    <div className="flex flex-wrap gap-2">
                        {attendance_calendar.map((entry) => (
                            <div
                                key={entry.date}
                                title={`${entry.date} — ${entry.status}`}
                                className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                                    entry.status === "PRESENT" ? "bg-[var(--success)]/15 text-[var(--success)]" : "bg-[var(--danger)]/15 text-[var(--danger)]"
                                }`}
                            >
                                {entry.date.slice(5)}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, accent }) {
    return (
        <div className="bg-[var(--neutral-50)] rounded-xl p-3 text-center">
            <div className={`text-2xl font-bold ${accent || "text-[var(--quinary)]"}`}>{value}</div>
            <div className="text-xs uppercase tracking-wide text-[var(--neutral-400)] mt-1">{label}</div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Tab 4 — Class analytics                                            */
/* ------------------------------------------------------------------ */

function ClassAnalyticsTab({ token, Classes, sectionOptionsFor, groupOptionsFor }) {
    const [classId, setClassId] = useState("");
    const [sectionId, setSectionId] = useState("");
    const [groupId, setGroupId] = useState("");
    const [period, setPeriod] = useState("month");
    const [date, setDate] = useState(todayISO());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);

    useEffect(() => {
        setSectionId("");
        setGroupId("");
    }, [classId]);

    const fetchAnalytics = async () => {
        if (!classId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ class_id: classId });
            if (sectionId) params.set("section_id", sectionId);
            if (groupId) params.set("group_id", groupId);
            if (period) {
                params.set("period", period);
                params.set("date", date);
            }
            const res = await api.get(`/attendance/class-analytics/?${params.toString()}`, authHeaders(token));
            setData(res.data);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (classId) fetchAnalytics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classId, sectionId, groupId, period, date]);

    // The class PDF export only supports week/month — "day" is
    // deliberately not offered as an option for that button.
    const downloadPDF = async () => {
        if (!classId) return;
        const pdfPeriod = period === "day" || period === "" ? "month" : period;
        setPdfLoading(true);
        try {
            const params = new URLSearchParams({ class_id: classId, period: pdfPeriod, date });
            if (sectionId) params.set("section_id", sectionId);
            if (groupId) params.set("group_id", groupId);
            const res = await api.get(`/attendance/class-pdf/?${params.toString()}`, {
                ...authHeaders(token),
                responseType: "blob",
            });
            const blob = new Blob([res.data], { type: "application/pdf" });
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = `class_${classId}_attendance.pdf`;
            link.click();
            URL.revokeObjectURL(objectUrl);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setPdfLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-4 mb-4 items-end">
                <div className="flex flex-col min-w-[200px]">
                    <label className={labelClass}>Class</label>
                    <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${inputClass} cursor-pointer`}>
                        <option value="">Select Class</option>
                        {Classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                                {cls.display_name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Section</label>
                    <select
                        value={sectionId}
                        onChange={(e) => setSectionId(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All sections</option>
                        {sectionOptionsFor(classId).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[160px]">
                    <label className={labelClass}>Group</label>
                    <select
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                        disabled={!classId}
                        className={`${inputClass} cursor-pointer disabled:opacity-50`}
                    >
                        <option value="">All groups</option>
                        {groupOptionsFor(classId).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {classId && (
                <>
                    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 mb-4 flex flex-wrap justify-between items-end gap-4">
                        <PeriodToggle period={period} onPeriodChange={setPeriod} date={date} onDateChange={setDate} options={["day", "week", "month"]} />
                        <div className="flex flex-col items-end gap-1">
                            <button
                                type="button"
                                onClick={downloadPDF}
                                disabled={pdfLoading}
                                className="border border-[var(--primary)] text-[var(--primary)] font-medium py-3 px-5 rounded-xl hover:bg-[var(--primary)]/10 transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {pdfLoading ? "Preparing PDF..." : "Download Class Report"}
                            </button>
                            {period === "day" && <span className="text-[11px] text-[var(--neutral-400)]">PDF report will use "month" — day isn't supported for exports.</span>}
                        </div>
                    </div>

                    {loading || !data ? (
                        <div className="text-center py-8 text-[var(--neutral-400)] text-sm">{loading ? "Loading analytics..." : "No data yet."}</div>
                    ) : (
                        <ClassSummaryView data={data} />
                    )}
                </>
            )}
        </div>
    );
}

function ClassSummaryView({ data }) {
    const { class: className, total_students, average_attendance, highest_attendance, lowest_attendance, total_present, total_absent, students, date_range } = data;

    return (
        <div>
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-5 mb-4">
                <div className="text-lg font-bold">{className}</div>
                {date_range && (
                    <div className="text-xs text-[var(--neutral-400)] mb-3">
                        Showing {date_range.start} to {date_range.end}
                    </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-2">
                    <StatCard label="Students" value={total_students} />
                    <StatCard label="Present" value={total_present} accent="text-[var(--success)]" />
                    <StatCard label="Absent" value={total_absent} accent="text-[var(--danger)]" />
                    <StatCard label="Average %" value={`${average_attendance}%`} accent="text-[var(--primary)]" />
                    <StatCard label="Highest %" value={`${highest_attendance}%`} accent="text-[var(--success)]" />
                    <StatCard label="Lowest %" value={`${lowest_attendance}%`} accent="text-[var(--danger)]" />
                </div>
            </div>

            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-[var(--neutral-500)] border-b border-[var(--neutral-100)]">
                            <th className="p-3">Student</th>
                            <th className="p-3">Section / Group</th>
                            <th className="p-3">Present</th>
                            <th className="p-3">Absent</th>
                            <th className="p-3">Total</th>
                            <th className="p-3">%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(students || []).map((s) => (
                            <tr key={s.student_db_id} className="border-b border-[var(--neutral-50)] last:border-0">
                                <td className="p-3">
                                    <div className="font-semibold">{s.full_name}</div>
                                    <div className="text-xs text-[var(--neutral-400)]">{s.student_id}</div>
                                </td>
                                <td className="p-3 text-xs text-[var(--neutral-500)]">
                                    {s.section || "—"} / {s.group || "—"}
                                </td>
                                <td className="p-3 text-[var(--success)]">{s.present}</td>
                                <td className="p-3 text-[var(--danger)]">{s.absent}</td>
                                <td className="p-3">{s.total_classes}</td>
                                <td className="p-3 font-semibold">{s.attendance_percentage}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  TEACHER ATTENDANCE — shared helpers                                */
/* ------------------------------------------------------------------ */

// TeacherAttendanceViewSet only supports these three query params
// (teacher / date / status) — there is no `search` param on the backend,
// so free-text search is always done client-side against fields the
// serializer already gives us (teacher_name / teacher_id).
const teacherMatchesQuery = (teacher, q) => {
    if (!q) return true;
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return (
        teacher.full_name?.toLowerCase().includes(query) ||
        teacher.teacher_id?.toLowerCase().includes(query) ||
        teacher.phone?.toLowerCase().includes(query)
    );
};

/* ------------------------------------------------------------------ */
/*  Teacher Tab 1 — Mark Attendance (roster -> bulk)                   */
/* ------------------------------------------------------------------ */

function TeacherMarkAttendanceTab({ token, Teachers }) {
    const [date, setDate] = useState(todayISO());
    const [search, setSearch] = useState("");

    const [existing, setExisting] = useState({}); // teacherId -> status, from already-saved records
    const [rosterLoading, setRosterLoading] = useState(false);
    const [attendanceData, setAttendanceData] = useState({});
    const [saving, setSaving] = useState(false);
    const [lastSummary, setLastSummary] = useState(null);

    const activeTeachers = useMemo(() => Teachers.filter((t) => t.is_active), [Teachers]);

    // Pull whatever's already been marked for this date so the roster
    // reflects reality instead of always defaulting to Present.
    useEffect(() => {
        if (!token || !date) return;

        setRosterLoading(true);
        setLastSummary(null);

        api.get(`/teacher-attendance/?date=${date}`, authHeaders(token))
            .then((res) => {
                const records = Array.isArray(res.data) ? res.data : res.data?.results || [];
                const map = {};
                records.forEach((r) => {
                    map[r.teacher] = r.status;
                });
                setExisting(map);
                const initial = {};
                activeTeachers.forEach((t) => {
                    initial[t.id] = map[t.id] || "PRESENT";
                });
                setAttendanceData(initial);
            })
            .catch(async (err) => toast("error", await extractErrorMessage(err)))
            .finally(() => setRosterLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, token, Teachers.length]);

    const filteredRoster = useMemo(() => {
        if (!search.trim()) return activeTeachers;
        return activeTeachers.filter((t) => teacherMatchesQuery(t, search));
    }, [activeTeachers, search]);

    const markStatus = (teacherId, status) => {
        setAttendanceData((prev) => ({ ...prev, [teacherId]: status }));
    };

    const markAllVisible = (status) => {
        setAttendanceData((prev) => {
            const next = { ...prev };
            filteredRoster.forEach((t) => {
                next[t.id] = status;
            });
            return next;
        });
    };

    const submitAttendance = async () => {
        if (!date) return toast("warning", "Please select a date before saving attendance!");
        if (activeTeachers.length === 0) return toast("warning", "There are no active teachers to mark.");

        const records = activeTeachers.map((t) => ({
            teacher: t.id,
            status: attendanceData[t.id] || "PRESENT",
        }));

        setSaving(true);
        try {
            const res = await api.post("/teacher-attendance/bulk/", { date, records }, authHeaders(token));
            const saved = Array.isArray(res.data) ? res.data : [];
            const present = saved.filter((r) => r.status === "PRESENT").length;
            const absent = saved.filter((r) => r.status === "ABSENT").length;
            setLastSummary({ total: saved.length, present, absent });
            toast("success", `Saved attendance for ${saved.length} teacher(s) on ${date}.`);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row gap-4 mb-4 items-end flex-wrap">
                <div className="flex flex-col min-w-[180px]">
                    <label className={labelClass}>Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} cursor-pointer`} />
                </div>

                <div className="flex flex-col min-w-[220px] flex-1">
                    <label className={labelClass}>Search roster</label>
                    <input
                        type="text"
                        placeholder="Name, teacher ID, or phone..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={inputClass}
                    />
                </div>
            </div>

            {filteredRoster.length > 0 && (
                <div className="flex justify-between items-center mb-3">
                    <div className="text-sm text-[var(--neutral-500)]">
                        {filteredRoster.length} active teacher{filteredRoster.length !== 1 ? "s" : ""}
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => markAllVisible("PRESENT")}
                            className="text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg border border-[var(--success)] text-[var(--success)] hover:bg-[var(--success)]/5 cursor-pointer"
                        >
                            Mark all present
                        </button>
                        <button
                            type="button"
                            onClick={() => markAllVisible("ABSENT")}
                            className="text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)]/5 cursor-pointer"
                        >
                            Mark all absent
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-6 space-y-4">
                {rosterLoading ? (
                    <div className="text-center py-8 text-[var(--neutral-400)] text-sm">Loading roster...</div>
                ) : filteredRoster.length > 0 ? (
                    filteredRoster.map((teacher) => {
                        const currentStatus = attendanceData[teacher.id] || "PRESENT";
                        return (
                            <div
                                key={teacher.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--neutral-100)] pb-4 last:border-0 last:pb-0 gap-3"
                            >
                                <div className="min-w-[220px]">
                                    <div className="font-semibold text-base text-[var(--quinary)]">{teacher.full_name}</div>
                                    <div className="text-xs text-[var(--neutral-400)]">
                                        {teacher.teacher_id}
                                        {teacher.phone ? ` · ${teacher.phone}` : ""}
                                        {existing[teacher.id] && <span className="text-[var(--primary)]"> · already marked</span>}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => markStatus(teacher.id, "PRESENT")}
                                        className={`px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-xl border transition-all duration-200 cursor-pointer ${
                                            currentStatus === "PRESENT" ? STATUS_STYLES.PRESENT : STATUS_IDLE
                                        }`}
                                    >
                                        Present
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => markStatus(teacher.id, "ABSENT")}
                                        className={`px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-xl border transition-all duration-200 cursor-pointer ${
                                            currentStatus === "ABSENT" ? STATUS_STYLES.ABSENT : STATUS_IDLE
                                        }`}
                                    >
                                        Absent
                                    </button>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-8 text-[var(--neutral-400)] text-sm">
                        {activeTeachers.length === 0 ? "No active teachers found." : "No teachers match this search."}
                    </div>
                )}
            </div>

            {filteredRoster.length > 0 && (
                <div className="mt-6 flex justify-end">
                    <button
                        type="button"
                        onClick={submitAttendance}
                        disabled={saving}
                        className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-[var(--surface)] font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
                    >
                        {saving ? "Processing Records..." : "Save Attendance"}
                    </button>
                </div>
            )}

            <p className="text-xs text-[var(--neutral-400)] mt-3">
                Note: saving always covers every active teacher for the selected date (not just the ones visible after
                a search) — the search box here only helps you find someone to check or flip their status.
            </p>

            {lastSummary && (
                <div className="mt-4 text-xs text-[var(--neutral-500)] bg-[var(--surface)] border border-[var(--neutral-200)] rounded-xl p-3">
                    Last save: {lastSummary.total} record(s) — {lastSummary.present} present, {lastSummary.absent} absent.
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Teacher Tab 2 — Records (filter, inline edit, delete, quick add)   */
/* ------------------------------------------------------------------ */

function TeacherRecordsTab({ token, Teachers }) {
    const [filters, setFilters] = useState({
        teacher: "",
        date: "",
        status: "",
    });
    const [search, setSearch] = useState("");
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);

    const setFilter = (key, val) => setFilters((prev) => ({ ...prev, [key]: val }));

    const fetchRecords = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.teacher) params.set("teacher", filters.teacher);
            if (filters.date) params.set("date", filters.date);
            if (filters.status) params.set("status", filters.status);
            const res = await api.get(`/teacher-attendance/?${params.toString()}`, authHeaders(token));
            setRecords(Array.isArray(res.data) ? res.data : res.data?.results || []);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, filters.teacher, filters.date, filters.status]);

    // The backend has no search param for this endpoint, so this runs
    // client-side over whatever `records` currently holds.
    const filteredRecords = useMemo(() => {
        if (!search.trim()) return records;
        const q = search.trim().toLowerCase();
        return records.filter(
            (r) => r.teacher_name?.toLowerCase().includes(q) || r.teacher_id?.toLowerCase().includes(q)
        );
    }, [records, search]);

    const updateStatus = async (record, status) => {
        if (record.status === status) return;
        setBusyId(record.id);
        try {
            await api.patch(`/teacher-attendance/${record.id}/`, { status }, authHeaders(token));
            setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, status } : r)));
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const deleteRecord = async (record) => {
        const confirm = await Swal.fire({
            title: "Delete this record?",
            text: `${record.teacher_name} · ${record.date}`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
            confirmButtonColor: "var(--danger)",
            background: "var(--secondary)",
            color: "var(--quinary)",
        });
        if (!confirm.isConfirmed) return;

        setBusyId(record.id);
        try {
            await api.delete(`/teacher-attendance/${record.id}/`, authHeaders(token));
            setRecords((prev) => prev.filter((r) => r.id !== record.id));
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            {/* Filters */}
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
                <div className="flex flex-col min-w-[200px] flex-1">
                    <label className={labelClass}>Search (on this page)</label>
                    <input
                        type="text"
                        placeholder="Teacher name or ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div className="flex flex-col min-w-[200px]">
                    <label className={labelClass}>Teacher</label>
                    <select
                        value={filters.teacher}
                        onChange={(e) => setFilter("teacher", e.target.value)}
                        className={`${inputClass} cursor-pointer`}
                    >
                        <option value="">All teachers</option>
                        {Teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.full_name} ({t.teacher_id})
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-[150px]">
                    <label className={labelClass}>Date</label>
                    <input type="date" value={filters.date} onChange={(e) => setFilter("date", e.target.value)} className={inputClass} />
                </div>
                <div className="flex flex-col min-w-[150px]">
                    <label className={labelClass}>Status</label>
                    <select
                        value={filters.status}
                        onChange={(e) => setFilter("status", e.target.value)}
                        className={`${inputClass} cursor-pointer`}
                    >
                        <option value="">All</option>
                        <option value="PRESENT">Present</option>
                        <option value="ABSENT">Absent</option>
                    </select>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="border border-[var(--primary)] text-[var(--primary)] font-medium py-3 px-5 rounded-xl hover:bg-[var(--primary)]/10 transition-colors cursor-pointer"
                >
                    {showAddForm ? "Cancel" : "+ Add record"}
                </button>
            </div>

            {showAddForm && (
                <TeacherQuickAddRecord
                    token={token}
                    Teachers={Teachers}
                    onCreated={(created) => {
                        setRecords((prev) => [created, ...prev]);
                        setShowAddForm(false);
                    }}
                />
            )}

            {/* Results table */}
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-[var(--neutral-500)] border-b border-[var(--neutral-100)]">
                            <th className="p-3">Teacher</th>
                            <th className="p-3">Date</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="text-center py-8 text-[var(--neutral-400)]">
                                    Loading records...
                                </td>
                            </tr>
                        ) : filteredRecords.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="text-center py-8 text-[var(--neutral-400)]">
                                    No attendance records match these filters.
                                </td>
                            </tr>
                        ) : (
                            filteredRecords.map((record) => (
                                <tr key={record.id} className="border-b border-[var(--neutral-50)] last:border-0">
                                    <td className="p-3">
                                        <div className="font-semibold">{record.teacher_name}</div>
                                        <div className="text-xs text-[var(--neutral-400)]">{record.teacher_id}</div>
                                    </td>
                                    <td className="p-3">{record.date}</td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={busyId === record.id}
                                                onClick={() => updateStatus(record, "PRESENT")}
                                                className={`px-3 py-1 text-xs font-bold uppercase rounded-lg border cursor-pointer disabled:opacity-50 ${
                                                    record.status === "PRESENT" ? STATUS_STYLES.PRESENT : STATUS_IDLE
                                                }`}
                                            >
                                                Present
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busyId === record.id}
                                                onClick={() => updateStatus(record, "ABSENT")}
                                                className={`px-3 py-1 text-xs font-bold uppercase rounded-lg border cursor-pointer disabled:opacity-50 ${
                                                    record.status === "ABSENT" ? STATUS_STYLES.ABSENT : STATUS_IDLE
                                                }`}
                                            >
                                                Absent
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button
                                            type="button"
                                            disabled={busyId === record.id}
                                            onClick={() => deleteRecord(record)}
                                            className="text-xs font-semibold text-[var(--danger)] hover:text-[var(--danger)] cursor-pointer disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function TeacherQuickAddRecord({ token, Teachers, onCreated }) {
    const [teacherId, setTeacherId] = useState("");
    const [date, setDate] = useState(todayISO());
    const [status, setStatus] = useState("PRESENT");
    const [saving, setSaving] = useState(false);

    // Only active teachers can be marked going forward, matching the rule
    // the bulk endpoint already enforces on the backend.
    const activeTeachers = useMemo(() => Teachers.filter((t) => t.is_active), [Teachers]);

    const submit = async () => {
        if (!teacherId || !date) return toast("warning", "Teacher and date are both required.");
        setSaving(true);
        try {
            const res = await api.post(
                "/teacher-attendance/",
                { teacher: Number(teacherId), date, status },
                authHeaders(token)
            );
            onCreated(res.data);
            toast("success", "Attendance record added.");
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col min-w-[240px] flex-1">
                <label className={labelClass}>Teacher</label>
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={`${inputClass} cursor-pointer`}>
                    <option value="">Select teacher</option>
                    {activeTeachers.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.full_name} ({t.teacher_id})
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex flex-col min-w-[150px]">
                <label className={labelClass}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div className="flex flex-col min-w-[140px]">
                <label className={labelClass}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} cursor-pointer`}>
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                </select>
            </div>
            <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-[var(--surface)] font-medium py-3 px-5 rounded-xl transition-colors cursor-pointer"
            >
                {saving ? "Saving..." : "Add record"}
            </button>
            <p className="text-xs text-[var(--neutral-400)] w-full">
                Note: a duplicate (teacher, date) pair will be rejected by the backend — edit the existing record in
                the table instead.
            </p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Teacher Tab 3 — Analytics (daily / monthly, matching the backend)  */
/* ------------------------------------------------------------------ */

function TeacherAnalyticsTab({ token }) {
    // The backend only exposes daily and monthly analytics for teacher
    // attendance (no "week", no all-time) — so the toggle mirrors that
    // exactly instead of reusing the student PeriodToggle.
    const [period, setPeriod] = useState("day");
    const [date, setDate] = useState(todayISO());
    const now = new Date();
    const [month, setMonth] = useState(String(now.getMonth() + 1));
    const [year, setYear] = useState(String(now.getFullYear()));

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchDaily = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/teacher-attendance/analytics/daily/?date=${date}`, authHeaders(token));
            setData(res.data);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const fetchMonthly = async () => {
        if (!month || !year) return;
        setLoading(true);
        try {
            const res = await api.get(
                `/teacher-attendance/analytics/monthly/?month=${month}&year=${year}`,
                authHeaders(token)
            );
            setData(res.data);
        } catch (err) {
            toast("error", await extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setData(null);
        if (period === "day") fetchDaily();
        else fetchMonthly();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, date, month, year, token]);

    return (
        <div>
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-4 mb-4 flex flex-wrap gap-4 items-end">
                <div className="flex flex-col">
                    <label className={labelClass}>Period</label>
                    <div className="flex gap-1 bg-[var(--neutral-100)] rounded-xl p-1">
                        {["day", "month"].map((opt) => (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => setPeriod(opt)}
                                className={`px-3 py-2 text-xs font-bold uppercase rounded-lg cursor-pointer ${
                                    period === opt ? "bg-[var(--surface)] shadow-sm text-[var(--primary)]" : "text-[var(--neutral-500)]"
                                }`}
                            >
                                {opt === "day" ? "Daily" : "Monthly"}
                            </button>
                        ))}
                    </div>
                </div>

                {period === "day" ? (
                    <div className="flex flex-col">
                        <label className={labelClass}>Date</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} cursor-pointer`} />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col min-w-[140px]">
                            <label className={labelClass}>Month</label>
                            <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputClass} cursor-pointer`}>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                    <option key={m} value={m}>
                                        {new Date(2000, m - 1, 1).toLocaleString("default", { month: "long" })}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col min-w-[120px]">
                            <label className={labelClass}>Year</label>
                            <input
                                type="number"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </>
                )}
            </div>

            {loading || !data ? (
                <div className="text-center py-8 text-[var(--neutral-400)] text-sm">{loading ? "Loading analytics..." : "No data yet."}</div>
            ) : period === "day" ? (
                <TeacherDailySummaryView data={data} />
            ) : (
                <TeacherMonthlySummaryView data={data} />
            )}
        </div>
    );
}

function TeacherDailySummaryView({ data }) {
    const { date, total_records, present, absent, attendance_rate, teachers } = data;
    return (
        <div>
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-5 mb-4">
                <div className="text-lg font-bold">{date}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
                    <StatCard label="Total" value={total_records} />
                    <StatCard label="Present" value={present} accent="text-[var(--success)]" />
                    <StatCard label="Absent" value={absent} accent="text-[var(--danger)]" />
                    <StatCard
                        label="Attendance %"
                        value={attendance_rate === null ? "—" : `${attendance_rate}%`}
                        accent="text-[var(--primary)]"
                    />
                </div>
            </div>

            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-[var(--neutral-500)] border-b border-[var(--neutral-100)]">
                            <th className="p-3">Teacher</th>
                            <th className="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(teachers || []).length === 0 ? (
                            <tr>
                                <td colSpan={2} className="text-center py-8 text-[var(--neutral-400)]">
                                    No attendance marked for this date.
                                </td>
                            </tr>
                        ) : (
                            teachers.map((t) => (
                                <tr key={`${t.teacher_id}-${t.status}`} className="border-b border-[var(--neutral-50)] last:border-0">
                                    <td className="p-3">
                                        <div className="font-semibold">{t.teacher_name}</div>
                                        <div className="text-xs text-[var(--neutral-400)]">{t.teacher_id}</div>
                                    </td>
                                    <td className="p-3">
                                        <span
                                            className={`px-2 py-1 text-xs font-bold uppercase rounded-lg ${
                                                t.status === "PRESENT"
                                                    ? "bg-[var(--success)]/15 text-[var(--success)]"
                                                    : "bg-[var(--danger)]/15 text-[var(--danger)]"
                                            }`}
                                        >
                                            {t.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function TeacherMonthlySummaryView({ data }) {
    const { month, year, total_records, present, absent, attendance_rate, teachers } = data;
    const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleString("default", {
        month: "long",
        year: "numeric",
    });

    return (
        <div>
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm p-5 mb-4">
                <div className="text-lg font-bold">{monthLabel}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
                    <StatCard label="Total" value={total_records} />
                    <StatCard label="Present" value={present} accent="text-[var(--success)]" />
                    <StatCard label="Absent" value={absent} accent="text-[var(--danger)]" />
                    <StatCard
                        label="Attendance %"
                        value={attendance_rate === null ? "—" : `${attendance_rate}%`}
                        accent="text-[var(--primary)]"
                    />
                </div>
            </div>

            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--neutral-200)] shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-[var(--neutral-500)] border-b border-[var(--neutral-100)]">
                            <th className="p-3">Teacher</th>
                            <th className="p-3">Present</th>
                            <th className="p-3">Absent</th>
                            <th className="p-3">Total</th>
                            <th className="p-3">%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(teachers || []).length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-[var(--neutral-400)]">
                                    No attendance marked for this month.
                                </td>
                            </tr>
                        ) : (
                            teachers.map((t) => (
                                <tr key={t.teacher_id} className="border-b border-[var(--neutral-50)] last:border-0">
                                    <td className="p-3">
                                        <div className="font-semibold">{t.teacher_name}</div>
                                        <div className="text-xs text-[var(--neutral-400)]">{t.teacher_id}</div>
                                    </td>
                                    <td className="p-3 text-[var(--success)]">{t.present}</td>
                                    <td className="p-3 text-[var(--danger)]">{t.absent}</td>
                                    <td className="p-3">{t.total_records}</td>
                                    <td className="p-3 font-semibold">
                                        {t.attendance_rate === null ? "—" : `${t.attendance_rate}%`}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default Attendance;