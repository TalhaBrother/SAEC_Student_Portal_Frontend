import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

// Backend choices (examination/models.py -> ClassTimetableEntry.DAYS)
const DAY_OPTIONS = [
    { value: "MONDAY", label: "Monday" },
    { value: "TUESDAY", label: "Tuesday" },
    { value: "WEDNESDAY", label: "Wednesday" },
    { value: "THURSDAY", label: "Thursday" },
    { value: "FRIDAY", label: "Friday" },
    { value: "SATURDAY", label: "Saturday" },
    { value: "SUNDAY", label: "Sunday" },
];

// Backend only allows 1-4 periods per day (serializer validation)
const PERIOD_CHOICES = [1, 2, 3, 4];

// A subject's Subject FK can come back either as a plain id or a nested
// object depending on the serializer -- handle both defensively.
const getSubjectClassId = (subject) => {
    if (subject?.student_class && typeof subject.student_class === "object") {
        return subject.student_class.id;
    }
    return subject?.student_class;
};

const emptySlot = () => ({ start_time: "", end_time: "", room_number: "" });

const defaultDayEntry = () => ({
    selected: false,
    periods: 1,
    slots: [emptySlot()],
});

// Builds a fresh { MONDAY: {...}, TUESDAY: {...}, ... } block for one subject
const buildSubjectDays = () =>
    DAY_OPTIONS.reduce((acc, day) => {
        acc[day.value] = defaultDayEntry();
        return acc;
    }, {});

const Examination = () => {
    const token = useAuthStore((state) => state.accessToken);
    const headers = { Authorization: `Bearer ${token}` };

    // ---------- REFERENCE DATA ----------
    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [existingClassIds, setExistingClassIds] = useState(new Set());
    const [loadingMeta, setLoadingMeta] = useState(true);

    // ---------- FORM STATE ----------
    const [selectedClassId, setSelectedClassId] = useState("");
    // { [subjectId]: { MONDAY: { selected, periods, slots: [{start_time,end_time,room_number}] }, ... } }
    const [timetableData, setTimetableData] = useState({});

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    // ---------- LOAD CLASSES / SUBJECTS / EXISTING TIMETABLES ----------
    const fetchMeta = async () => {
        setLoadingMeta(true);
        try {
            const [classesRes, subjectsRes, timetablesRes] = await Promise.all([
                api.get("/classes/", { headers }),
                api.get("/subjects/", { headers }),
                api.get("examination/class-timetables/", { headers }),
            ]);

            const sortedClasses = [...classesRes.data].sort((a, b) => a.id - b.id);
            setClasses(sortedClasses);
            setSubjects(subjectsRes.data || []);

            const takenIds = new Set(
                (timetablesRes.data || []).map((t) =>
                    typeof t.student_class === "object" ? t.student_class.id : t.student_class
                )
            );
            setExistingClassIds(takenIds);
        } catch (error) {
            console.error("Error loading timetable setup data:", error);
            setMessage({
                type: "error",
                text: "Failed to load classes/subjects. Please refresh and try again.",
            });
        } finally {
            setLoadingMeta(false);
        }
    };

    useEffect(() => {
        fetchMeta();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------- SUBJECTS FOR SELECTED CLASS ----------
    const subjectsForClass = useMemo(() => {
        if (!selectedClassId) return [];
        return subjects.filter(
            (s) => String(getSubjectClassId(s)) === String(selectedClassId)
        );
    }, [subjects, selectedClassId]);

    const classAlreadyHasTimetable = selectedClassId
        ? existingClassIds.has(Number(selectedClassId))
        : false;

    // Reset the builder whenever the selected class changes
    useEffect(() => {
        if (!selectedClassId) {
            setTimetableData({});
            return;
        }

        setMessage({ type: "", text: "" });

        const fresh = {};
        subjectsForClass.forEach((subject) => {
            fresh[subject.id] = buildSubjectDays();
        });
        setTimetableData(fresh);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClassId]);

    // ---------- FORM HELPERS ----------
    const toggleDay = (subjectId, day) => {
        setTimetableData((prev) => ({
            ...prev,
            [subjectId]: {
                ...prev[subjectId],
                [day]: {
                    ...prev[subjectId][day],
                    selected: !prev[subjectId][day].selected,
                },
            },
        }));
    };

    const changePeriods = (subjectId, day, periodsCount) => {
        setTimetableData((prev) => {
            const current = prev[subjectId][day];
            let nextSlots = [...current.slots];

            if (periodsCount > nextSlots.length) {
                while (nextSlots.length < periodsCount) nextSlots.push(emptySlot());
            } else {
                nextSlots = nextSlots.slice(0, periodsCount);
            }

            return {
                ...prev,
                [subjectId]: {
                    ...prev[subjectId],
                    [day]: {
                        ...current,
                        periods: periodsCount,
                        slots: nextSlots,
                    },
                },
            };
        });
    };

    const updateSlot = (subjectId, day, slotIndex, field, value) => {
        setTimetableData((prev) => {
            const current = prev[subjectId][day];
            const nextSlots = current.slots.map((slot, i) =>
                i === slotIndex ? { ...slot, [field]: value } : slot
            );

            return {
                ...prev,
                [subjectId]: {
                    ...prev[subjectId],
                    [day]: { ...current, slots: nextSlots },
                },
            };
        });
    };

    // ---------- BUILD PAYLOAD ----------
    const buildEntries = () => {
        const entries = [];

        Object.entries(timetableData).forEach(([subjectId, days]) => {
            Object.entries(days).forEach(([day, dayData]) => {
                if (!dayData.selected) return;

                dayData.slots.forEach((slot, index) => {
                    entries.push({
                        subject: Number(subjectId),
                        day,
                        period_number: index + 1,
                        start_time: slot.start_time,
                        end_time: slot.end_time,
                        room_number: slot.room_number.trim() || null,
                    });
                });
            });
        });

        return entries;
    };

    const selectedEntryCount = useMemo(() => buildEntries().length, [timetableData]);

    // ---------- SUBMIT ----------
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!selectedClassId) {
            setMessage({ type: "error", text: "Please select a class first." });
            return;
        }

        const entries = buildEntries();

        if (entries.length === 0) {
            setMessage({
                type: "error",
                text: "Select at least one day and add a time slot for a subject.",
            });
            return;
        }

        setSaving(true);
        setMessage({ type: "", text: "" });

        const payload = {
            student_class: Number(selectedClassId),
            entries,
        };

        try {
            const res = await api.post("examination/class-timetables/", payload, { headers });
            console.log("Timetable Created Successfully:", res.data);

            setMessage({ type: "success", text: "Class timetable created successfully!" });
            setExistingClassIds((prev) => new Set(prev).add(Number(selectedClassId)));
            setSelectedClassId("");
            setTimetableData({});
        } catch (error) {
            console.error("Error saving timetable:", error);

            const data = error.response?.data;
            const nonFieldError = data?.non_field_errors?.[0];
            const firstFieldError =
                data && typeof data === "object" ? Object.values(data).flat()[0] : null;

            setMessage({
                type: "error",
                text:
                    nonFieldError ||
                    firstFieldError ||
                    "Failed to save timetable. Please try again.",
            });
        } finally {
            setSaving(false);
        }
    };

    const selectedClass = classes.find((c) => String(c.id) === String(selectedClassId));

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Header */}
            <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
                <div>
                    <div className="text-3xl font-bold tracking-tight text-[var(--quinary)]">
                        Class Timetable
                    </div>
                    <p className="text-gray-500 text-sm mt-1">
                        Select a class, choose which days each subject is taught, and set the
                        period timings.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={fetchMeta}
                    disabled={loadingMeta}
                    className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[var(--quinary)] font-medium py-2.5 px-4 rounded-xl border border-gray-300 transition-colors text-sm cursor-pointer"
                >
                    {loadingMeta ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {/* Status Message Display */}
            {message.text && (
                <div
                    className={`p-3 rounded-xl text-sm mb-6 text-center border max-w-xl ${
                        message.type === "success"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-red-50 text-red-700 border-red-200"
                    }`}
                >
                    {message.text}
                </div>
            )}

            {loadingMeta ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm max-w-xl">
                    Loading classes and subjects...
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* ---------------- CLASS SELECTOR ---------------- */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-xl">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1 block">
                            Class
                        </label>
                        <select
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                            required
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                        >
                            <option value="">Select Class</option>
                            {classes.map((cls) => (
                                <option key={cls.id} value={cls.id}>
                                    {cls.display_name}
                                    {existingClassIds.has(cls.id) ? " (timetable exists)" : ""}
                                </option>
                            ))}
                        </select>

                        {classAlreadyHasTimetable && (
                            <p className="text-amber-600 text-xs mt-3">
                                Class {selectedClass?.name} already has a timetable. Editing an
                                existing timetable isn't available yet — pick another class for
                                now.
                            </p>
                        )}
                    </div>

                    {/* ---------------- SUBJECT / DAY / PERIOD BUILDER ---------------- */}
                    {selectedClassId && !classAlreadyHasTimetable && (
                        <>
                            {subjectsForClass.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm max-w-xl">
                                    No subjects found for this class. Add subjects to this class
                                    first.
                                </div>
                            ) : (
                                <div className="space-y-4 max-w-4xl">
                                    {subjectsForClass.map((subject) => (
                                        <div
                                            key={subject.id}
                                            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6"
                                        >
                                            <div className="text-lg font-semibold text-[var(--quinary)] mb-4">
                                                {subject.name}
                                            </div>

                                            {/* Day toggle pills */}
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {DAY_OPTIONS.map((day) => {
                                                    const isSelected =
                                                        timetableData[subject.id]?.[day.value]
                                                            ?.selected;
                                                    return (
                                                        <button
                                                            key={day.value}
                                                            type="button"
                                                            onClick={() =>
                                                                toggleDay(subject.id, day.value)
                                                            }
                                                            className={`text-sm font-medium px-4 py-2 rounded-xl border transition-colors cursor-pointer ${
                                                                isSelected
                                                                    ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                                                                    : "bg-white text-[var(--quinary)] border-gray-300 hover:bg-gray-50"
                                                            }`}
                                                        >
                                                            {day.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Per selected day: periods + time slots */}
                                            <div className="space-y-4">
                                                {DAY_OPTIONS.filter(
                                                    (day) =>
                                                        timetableData[subject.id]?.[day.value]
                                                            ?.selected
                                                ).map((day) => {
                                                    const dayData =
                                                        timetableData[subject.id][day.value];

                                                    return (
                                                        <div
                                                            key={day.value}
                                                            className="bg-gray-50 rounded-xl border border-gray-200 p-4"
                                                        >
                                                            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                                                                <span className="text-sm font-semibold text-[var(--quinary)]">
                                                                    {day.label}
                                                                </span>

                                                                <div className="flex items-center gap-2">
                                                                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                                                        Periods
                                                                    </label>
                                                                    <select
                                                                        value={dayData.periods}
                                                                        onChange={(e) =>
                                                                            changePeriods(
                                                                                subject.id,
                                                                                day.value,
                                                                                Number(
                                                                                    e.target.value
                                                                                )
                                                                            )
                                                                        }
                                                                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                                                                    >
                                                                        {PERIOD_CHOICES.map((n) => (
                                                                            <option
                                                                                key={n}
                                                                                value={n}
                                                                            >
                                                                                {n}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-2">
                                                                {dayData.slots.map(
                                                                    (slot, index) => (
                                                                        <div
                                                                            key={index}
                                                                            className="flex items-center gap-2 flex-wrap"
                                                                        >
                                                                            <span className="text-xs text-gray-400 font-medium w-16 shrink-0">
                                                                                Period {index + 1}
                                                                            </span>

                                                                            <input
                                                                                type="time"
                                                                                value={
                                                                                    slot.start_time
                                                                                }
                                                                                onChange={(e) =>
                                                                                    updateSlot(
                                                                                        subject.id,
                                                                                        day.value,
                                                                                        index,
                                                                                        "start_time",
                                                                                        e.target
                                                                                            .value
                                                                                    )
                                                                                }
                                                                                required
                                                                                className="bg-white text-[var(--quinary)] border border-gray-300 rounded-lg p-2 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                                                                            />

                                                                            <span className="text-gray-400 text-sm">
                                                                                to
                                                                            </span>

                                                                            <input
                                                                                type="time"
                                                                                value={
                                                                                    slot.end_time
                                                                                }
                                                                                onChange={(e) =>
                                                                                    updateSlot(
                                                                                        subject.id,
                                                                                        day.value,
                                                                                        index,
                                                                                        "end_time",
                                                                                        e.target
                                                                                            .value
                                                                                    )
                                                                                }
                                                                                required
                                                                                className="bg-white text-[var(--quinary)] border border-gray-300 rounded-lg p-2 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                                                                            />

                                                                            <input
                                                                                type="text"
                                                                                value={
                                                                                    slot.room_number
                                                                                }
                                                                                onChange={(e) =>
                                                                                    updateSlot(
                                                                                        subject.id,
                                                                                        day.value,
                                                                                        index,
                                                                                        "room_number",
                                                                                        e.target
                                                                                            .value
                                                                                    )
                                                                                }
                                                                                placeholder="Room no. (optional)"
                                                                                className="flex-1 min-w-[140px] bg-white text-[var(--quinary)] border border-gray-300 rounded-lg p-2 outline-none focus:border-[var(--primary)] transition-colors text-sm placeholder-gray-400"
                                                                            />
                                                                        </div>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ---------------- SAVE ---------------- */}
                            {subjectsForClass.length > 0 && (
                                <div className="flex items-center justify-between max-w-4xl">
                                    <span className="text-xs text-gray-400">
                                        {selectedEntryCount} period
                                        {selectedEntryCount === 1 ? "" : "s"} will be added.
                                    </span>

                                    <button
                                        type="submit"
                                        disabled={saving || selectedEntryCount === 0}
                                        className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
                                    >
                                        {saving ? "Saving..." : "Create Timetable"}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </form>
            )}
        </div>
    );
};

export default Examination;