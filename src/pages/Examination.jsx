import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HiOutlineArrowDownTray, HiOutlineArrowPath } from 'react-icons/hi2';
import Swal from 'sweetalert2';
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

// Backend TimeField serializes as "HH:MM:SS" -- <input type="time"> needs "HH:MM"
const formatTimeForInput = (value) => (value ? value.slice(0, 5) : "");

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

// Extracts a plain class id whether the API gave us an id or a nested object
const getClassIdOf = (value) =>
    value && typeof value === "object" ? value.id : value;

const Examination = () => {
    const token = useAuthStore((state) => state.accessToken);
    const headers = { Authorization: `Bearer ${token}` };

    // ---------- TAB ----------
    const [activeTab, setActiveTab] = useState("list"); // 'list' | 'form'

    // ---------- REFERENCE DATA ----------
    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [existingClassIds, setExistingClassIds] = useState(new Set());
    const [loadingMeta, setLoadingMeta] = useState(true);

    // ---------- LIST STATE ----------
    const [timetables, setTimetables] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [listError, setListError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [filterClassId, setFilterClassId] = useState("");
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [downloadingId, setDownloadingId] = useState(null);
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // ---------- FORM STATE ----------
    const [editingId, setEditingId] = useState(null);
    const [editingEntries, setEditingEntries] = useState(null);
    const [editingOriginalClassId, setEditingOriginalClassId] = useState(null);
    const [selectedClassId, setSelectedClassId] = useState("");
    // { [subjectId]: { MONDAY: { selected, periods, slots: [{start_time,end_time,room_number}] }, ... } }
    const [timetableData, setTimetableData] = useState({});

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    // ==================================================================
    // ========================= TEST TIMETABLE ========================
    // ==================================================================
    // Backend workflow:
    //   Existing Test -> assigned classes -> one selected class
    //   -> subjects of that class -> TestTimetable entries.
    // TestTimetable is identified by test + student_class; there is no
    // separate timetable name field in the backend.

    const [section, setSection] = useState("class"); // 'class' | 'test'

    // ---------- TEST LIST STATE ----------
    const [testTimetables, setTestTimetables] = useState([]);
    const [loadingTestList, setLoadingTestList] = useState(true);
    const [testListError, setTestListError] = useState("");
    const [testSearchTerm, setTestSearchTerm] = useState("");
    const [testFilterClassId, setTestFilterClassId] = useState("");
    const [testExpandedIds, setTestExpandedIds] = useState(new Set());
    const [deleteTestTarget, setDeleteTestTarget] = useState(null);
    const [deletingTest, setDeletingTest] = useState(false);

    // ---------- TEST REFERENCE DATA ----------
    const [tests, setTests] = useState([]);
    const [loadingTests, setLoadingTests] = useState(false);

    // ---------- TEST FORM STATE ----------
    const [testActiveTab, setTestActiveTab] = useState("list"); // 'list' | 'form'
    const [editingTestId, setEditingTestId] = useState(null);
    const [selectedTestId, setSelectedTestId] = useState("");
    const [selectedTestClassId, setSelectedTestClassId] = useState("");

    // 1. Add state for tracking the bulk PDF download status
    const [downloadingAllTestPdf, setDownloadingAllTestPdf] = useState(false);
    // Per-row PDF download status, keyed by the row's test id
    const [downloadingTestId, setDownloadingTestId] = useState(null);

    // One row is created for every subject of the selected class.
    const emptyTestEntry = (subject = "") => ({
        subject: subject ? String(subject) : "",
        date: "",
        start_time: "",
        end_time: "",
        room_number: "",
    });
    const [testEntries, setTestEntries] = useState([]);
    const [savingTest, setSavingTest] = useState(false);

    // ---------- LOAD AVAILABLE TESTS ----------
    const fetchTestsForTimetable = useCallback(async () => {
        setLoadingTests(true);
        try {
            const res = await api.get("/tests/", { headers });
            const data = Array.isArray(res.data) ? res.data : res.data?.results || [];
            setTests(data);
        } catch (error) {
            console.error("Error loading tests:", error);
            setTests([]);
            setTestListError("Failed to load tests. Please try again.");
        } finally {
            setLoadingTests(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // ---------- LOAD TEST TIMETABLES ----------
    const fetchTestTimetables = useCallback(async () => {
        setLoadingTestList(true);
        setTestListError("");
        try {
            const params = {};
            if (testSearchTerm.trim()) params.search = testSearchTerm.trim();
            if (testFilterClassId) params.student_class = testFilterClassId;

            const res = await api.get("examination/test-timetables/", {
                headers,
                params,
            });

            setTestTimetables(res.data || []);
        } catch (error) {
            console.error("Error loading test timetables:", error);
            setTestListError("Failed to load test timetables. Please try again.");
        } finally {
            setLoadingTestList(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [testSearchTerm, testFilterClassId, token]);

    useEffect(() => {
        const timer = setTimeout(() => fetchTestTimetables(), 350);
        return () => clearTimeout(timer);
    }, [fetchTestTimetables]);

    useEffect(() => {
        if (!token) return;
        fetchTestsForTimetable();
    }, [token, fetchTestsForTimetable]);

    // ---------- SELECTED TEST / ASSIGNED CLASSES ----------
    const selectedTest = useMemo(
        () => tests.find((test) => String(test.id) === String(selectedTestId)),
        [tests, selectedTestId]
    );

    const assignedClassIds = useMemo(() => {
        if (!selectedTest) return [];

        if (Array.isArray(selectedTest.classes_detail) && selectedTest.classes_detail.length) {
            return selectedTest.classes_detail.map((cls) => Number(cls.id));
        }

        if (Array.isArray(selectedTest.classes)) {
            return selectedTest.classes
                .map((cls) => Number(getClassIdOf(cls)))
                .filter((id) => Number.isFinite(id));
        }

        return [];
    }, [selectedTest]);

    const assignedClasses = useMemo(
        () => classes.filter((cls) => assignedClassIds.includes(Number(cls.id))),
        [classes, assignedClassIds]
    );

    const subjectsForTestClass = useMemo(() => {
        if (!selectedTestClassId) return [];
        return subjects.filter(
            (s) => String(getSubjectClassId(s)) === String(selectedTestClassId)
        );
    }, [subjects, selectedTestClassId]);

    const populateTestEntriesForClass = useCallback(
        (classId, existingEntries = null) => {
            if (!classId) {
                setTestEntries([]);
                return;
            }

            const classSubjects = subjects.filter(
                (subject) => String(getSubjectClassId(subject)) === String(classId)
            );

            if (existingEntries) {
                const existingBySubject = new Map(
                    existingEntries.map((entry) => [
                        String(getClassIdOf(entry.subject) ?? entry.subject),
                        {
                            subject: String(getClassIdOf(entry.subject) ?? entry.subject),
                            date: entry.date || "",
                            start_time: formatTimeForInput(entry.start_time),
                            end_time: formatTimeForInput(entry.end_time),
                            room_number: entry.room_number || "",
                        },
                    ])
                );

                setTestEntries(
                    classSubjects.map((subject) =>
                        existingBySubject.get(String(subject.id)) || emptyTestEntry(subject.id)
                    )
                );
                return;
            }

            setTestEntries(classSubjects.map((subject) => emptyTestEntry(subject.id)));
        },
        [subjects]
    );

    const handleSelectedTestChange = (testId) => {
        setSelectedTestId(testId);
        setSelectedTestClassId("");
        setTestEntries([]);
    };

    const handleSelectedTestClassChange = (classId) => {
        setSelectedTestClassId(classId);
        populateTestEntriesForClass(classId);
    };

    const updateTestEntry = (index, field, value) => {
        setTestEntries((prev) =>
            prev.map((entry, i) =>
                i === index ? { ...entry, [field]: value } : entry
            )
        );
    };

    const validTestEntries = useMemo(
        () =>
            testEntries.filter(
                (e) => e.subject && e.date && e.start_time && e.end_time
            ),
        [testEntries]
    );

    const startAddNewTest = async () => {
        setEditingTestId(null);
        setSelectedTestId("");
        setSelectedTestClassId("");
        setTestEntries([]);
        setTestListError("");

        if (!tests.length) await fetchTestsForTimetable();
        setTestActiveTab("form");
    };

    const startEditTest = (timetable) => {
        const classId = getClassIdOf(timetable.student_class);
        const testId = getClassIdOf(timetable.test);

        setEditingTestId(timetable.id);
        setSelectedTestId(String(testId));
        setSelectedTestClassId(String(classId));
        populateTestEntriesForClass(classId, timetable.entries || []);
        setTestActiveTab("form");
    };

    const cancelTestForm = () => {
        setEditingTestId(null);
        setSelectedTestId("");
        setSelectedTestClassId("");
        setTestEntries([]);
        setTestActiveTab("list");
    };

    // ---------- SUBMIT (CREATE / UPDATE) ----------
    const handleTestSubmit = async (e) => {
        e.preventDefault();

        if (!selectedTestId) {
            return Swal.fire({
                icon: "warning",
                title: "Select a test",
                text: "Please select an existing test first.",
                confirmButtonColor: "#dc2626",
            });
        }

        if (!selectedTestClassId) {
            return Swal.fire({
                icon: "warning",
                title: "Select a class",
                text: "Please select one of the classes assigned to this test.",
                confirmButtonColor: "#dc2626",
            });
        }

        if (!assignedClassIds.includes(Number(selectedTestClassId))) {
            return Swal.fire({
                icon: "warning",
                title: "Class not assigned",
                text: "The selected class is not assigned to this test.",
                confirmButtonColor: "#dc2626",
            });
        }

        if (subjectsForTestClass.length === 0) {
            return Swal.fire({
                icon: "warning",
                title: "No subjects",
                text: "No subjects were found for the selected class.",
                confirmButtonColor: "#dc2626",
            });
        }

        if (validTestEntries.length === 0 || validTestEntries.length !== testEntries.length) {
            return Swal.fire({
                icon: "warning",
                title: "Incomplete timetable",
                text: "Please complete the date, start time, and end time for every subject shown.",
                confirmButtonColor: "#dc2626",
            });
        }

        setSavingTest(true);

        const payload = {
            test: Number(selectedTestId),
            student_class: Number(selectedTestClassId),
            entries: validTestEntries.map((entry) => ({
                subject: Number(entry.subject),
                date: entry.date,
                start_time: entry.start_time,
                end_time: entry.end_time,
                room_number: entry.room_number.trim() || null,
            })),
        };

        try {
            if (editingTestId) {
                await api.put(`examination/test-timetables/${editingTestId}/`, payload, { headers });
            } else {
                await api.post("examination/test-timetables/", payload, { headers });
            }

            await fetchTestTimetables();

            await Swal.fire({
                icon: "success",
                title: editingTestId ? "Test timetable updated!" : "Test timetable created!",
                text: editingTestId
                    ? "Test timetable updated successfully!"
                    : "Test timetable created successfully!",
                confirmButtonColor: "var(--primary)",
                timer: 2000,
                timerProgressBar: true,
            });

            cancelTestForm();
        } catch (error) {
            console.error("Error saving test timetable:", error);
            Swal.fire({
                icon: "error",
                title: "Could not save test timetable",
                text: extractErrorMessage(
                    error,
                    "Failed to save test timetable. Please check the details and try again."
                ),
                confirmButtonColor: "#dc2626",
            });
        } finally {
            setSavingTest(false);
        }
    };

    const handleDeleteTest = async () => {
        if (!deleteTestTarget) return;

        setDeletingTest(true);
        try {
            await api.delete(`examination/test-timetables/${deleteTestTarget.id}/`, { headers });
            setDeleteTestTarget(null);
            await fetchTestTimetables();
        } catch (error) {
            console.error("Error deleting test timetable:", error);
            Swal.fire({
                icon: "error",
                title: "Could not delete test timetable",
                text: extractErrorMessage(error, "Failed to delete test timetable. Please try again."),
                confirmButtonColor: "#dc2626",
            });
        } finally {
            setDeletingTest(false);
        }
    };

    const toggleTestExpanded = (id) => {
        setTestExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectedTestClass = classes.find(
        (c) => String(c.id) === String(selectedTestClassId)
    );

    // ==================================================================
    // ======================= END TEST TIMETABLE ======================
    // ==================================================================

    // ---------- LOAD CLASSES / SUBJECTS ----------
    const fetchMeta = async () => {
        setLoadingMeta(true);
        try {
            const [classesRes, subjectsRes] = await Promise.all([
                api.get("/classes/", { headers }),
                api.get("/subjects/", { headers }),
            ]);

            const sortedClasses = [...classesRes.data].sort((a, b) => a.id - b.id);
            setClasses(sortedClasses);
            setSubjects(subjectsRes.data || []);
        } catch (error) {
            console.error("Error loading classes/subjects:", error);
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

    // ---------- LOAD TIMETABLES (search + filter) ----------
    const fetchTimetables = useCallback(async () => {
        setLoadingList(true);
        setListError("");
        try {
            const params = {};
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (filterClassId) params.student_class = filterClassId;

            const res = await api.get("examination/class-timetables/", {
                headers,
                params,
            });

            const data = res.data || [];
            setTimetables(data);
            setExistingClassIds(
                new Set(data.map((t) => getClassIdOf(t.student_class)))
            );
        } catch (error) {
            console.error("Error loading timetables:", error);
            setListError("Failed to load timetables. Please try again.");
        } finally {
            setLoadingList(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, filterClassId, token]);

    // Debounce search/filter changes
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchTimetables();
        }, 350);
        return () => clearTimeout(timer);
    }, [fetchTimetables]);

    // ---------- SUBJECTS FOR SELECTED CLASS ----------
    const subjectsForClass = useMemo(() => {
        if (!selectedClassId) return [];
        return subjects.filter(
            (s) => String(getSubjectClassId(s)) === String(selectedClassId)
        );
    }, [subjects, selectedClassId]);

    // A class already has a timetable UNLESS it's the one we're currently editing
    const classAlreadyHasTimetable = selectedClassId
        ? existingClassIds.has(Number(selectedClassId)) &&
        Number(selectedClassId) !== Number(editingOriginalClassId)
        : false;

    // Reset / repopulate the builder whenever the selected class (or the
    // timetable being edited) changes
    useEffect(() => {
        if (!selectedClassId) {
            setTimetableData({});
            return;
        }

        const fresh = {};
        subjectsForClass.forEach((subject) => {
            fresh[subject.id] = buildSubjectDays();
        });

        // If we're editing an existing timetable, overlay its entries
        if (editingEntries && editingEntries.length) {
            const grouped = {};

            editingEntries.forEach((entry) => {
                const subjId = getClassIdOf(entry.subject) ?? entry.subject;
                if (!grouped[subjId]) grouped[subjId] = {};
                if (!grouped[subjId][entry.day]) grouped[subjId][entry.day] = [];
                grouped[subjId][entry.day].push(entry);
            });

            Object.entries(grouped).forEach(([subjId, days]) => {
                if (!fresh[subjId]) return;

                Object.entries(days).forEach(([day, entries]) => {
                    const sorted = [...entries].sort(
                        (a, b) => a.period_number - b.period_number
                    );

                    fresh[subjId][day] = {
                        selected: true,
                        periods: sorted.length,
                        slots: sorted.map((e) => ({
                            start_time: formatTimeForInput(e.start_time),
                            end_time: formatTimeForInput(e.end_time),
                            room_number: e.room_number || "",
                        })),
                    };
                });
            });
        }

        setTimetableData(fresh);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClassId, editingEntries, subjectsForClass]);

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

    // ---------- ADD NEW / EDIT / CANCEL ----------
    const startAddNew = () => {
        setEditingId(null);
        setEditingEntries(null);
        setEditingOriginalClassId(null);
        setSelectedClassId("");
        setTimetableData({});
        setMessage({ type: "", text: "" });
        setActiveTab("form");
    };

    const startEdit = (timetable) => {
        const classId = getClassIdOf(timetable.student_class);
        setEditingId(timetable.id);
        setEditingEntries(timetable.entries || []);
        setEditingOriginalClassId(classId);
        setSelectedClassId(String(classId));
        setMessage({ type: "", text: "" });
        setActiveTab("form");
    };

    const cancelForm = () => {
        startAddNew();
        setActiveTab("list");
    };

    // ---------- SUBMIT (CREATE or UPDATE) ----------
    // Pulls the most relevant error message out of a DRF error response.
    // Falls back to a generic message if the shape is unexpected.
    const extractErrorMessage = (error, fallback) => {
        const data = error?.response?.data;

        if (!data) return fallback;

        if (typeof data === "string") return data;

        const nonFieldError = data?.non_field_errors?.[0];
        if (nonFieldError) return nonFieldError;

        // e.g. { entries: "Timetable conflict between 'Math' and 'Physics' on MONDAY." }
        // or   { student_class: "A timetable already exists for this class." }
        const firstFieldError =
            typeof data === "object" ? Object.values(data).flat()[0] : null;

        return firstFieldError || fallback;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!selectedClassId) {
            Swal.fire({
                icon: "warning",
                title: "Select a class",
                text: "Please select a class first.",
                confirmButtonColor: "#dc2626",
            });
            return;
        }

        const entries = buildEntries();

        if (entries.length === 0) {
            Swal.fire({
                icon: "warning",
                title: "Nothing to save",
                text: "Select at least one day and add a time slot for a subject.",
                confirmButtonColor: "#dc2626",
            });
            return;
        }

        setSaving(true);

        const payload = {
            student_class: Number(selectedClassId),
            entries,
        };

        try {
            if (editingId) {
                await api.put(
                    `examination/class-timetables/${editingId}/`,
                    payload,
                    { headers }
                );
            } else {
                await api.post("examination/class-timetables/", payload, { headers });
            }

            await fetchTimetables();

            await Swal.fire({
                icon: "success",
                title: editingId ? "Timetable updated!" : "Timetable created!",
                text: editingId
                    ? "Class timetable updated successfully!"
                    : "Class timetable created successfully!",
                confirmButtonColor: "var(--primary)",
                timer: 2000,
                timerProgressBar: true,
            });

            // Only clear the form / leave the form tab on a SUCCESSFUL save.
            setEditingId(null);
            setEditingEntries(null);
            setEditingOriginalClassId(null);
            setSelectedClassId("");
            setTimetableData({});
            setActiveTab("list");
        } catch (error) {
            console.error("Error saving timetable:", error);

            const errorText = extractErrorMessage(
                error,
                "Failed to save timetable. Please check the details and try again."
            );

            Swal.fire({
                icon: "error",
                title: "Could not save timetable",
                text: errorText,
                confirmButtonColor: "#dc2626",
            });

            // Intentionally NOT resetting selectedClassId / timetableData /
            // editingId here -- the user's entries stay exactly as filled so
            // they can fix the offending field and resubmit without
            // re-entering everything.
        } finally {
            setSaving(false);
        }
    };

    // ---------- DELETE ----------
    const handleDelete = async () => {
        if (!deleteTarget) return;

        setDeleting(true);
        try {
            await api.delete(
                `examination/class-timetables/${deleteTarget.id}/`,
                { headers }
            );
            setDeleteTarget(null);
            await fetchTimetables();
        } catch (error) {
            console.error("Error deleting timetable:", error);
            // Keep the confirmation modal open (deleteTarget intact) so the
            // user can simply retry instead of re-selecting the timetable.
            Swal.fire({
                icon: "error",
                title: "Could not delete timetable",
                text: extractErrorMessage(
                    error,
                    "Failed to delete timetable. Please try again."
                ),
                confirmButtonColor: "#dc2626",
            });
        } finally {
            setDeleting(false);
        }
    };

    // ---------- PDF DOWNLOADS ----------
    const downloadBlob = (blobData, filename) => {
        const url = window.URL.createObjectURL(new Blob([blobData]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const getClassLabel = (value) => {
        if (value && typeof value === "object") {
            return value.display_name || value.name || `Class #${value.id}`;
        }
        const found = classes.find((c) => c.id === value);
        return found ? found.display_name || found.name : `Class #${value}`;
    };

    const handleDownloadPDF = async (timetable) => {
        setDownloadingId(timetable.id);
        try {
            const res = await api.get(
                `examination/class-timetables/${timetable.id}/pdf/`,
                { headers, responseType: "blob" }
            );
            const label = getClassLabel(timetable.student_class);
            downloadBlob(res.data, `class_timetable_${label}.pdf`);
        } catch (error) {
            console.error("Error downloading PDF:", error);
            Swal.fire({
                icon: "error",
                title: "Download failed",
                text: extractErrorMessage(
                    error,
                    "Failed to download PDF. Please try again."
                ),
                confirmButtonColor: "#dc2626",
            });
        } finally {
            setDownloadingId(null);
        }
    };

  const handleDownloadAllPDF = async () => {
    setDownloadingAll(true);
    try {
        const res = await api.get("examination/class-timetables/pdf/", {
            headers,
            responseType: "blob",
            params: {
                class_id: filterClassId || undefined, // Sends selected class filter if active
            },
        });
        downloadBlob(res.data, "all_class_timetables.pdf");
    } catch (error) {
        console.error("Error downloading all timetables PDF:", error);

        // If backend returns a JSON/text error inside a Blob, extract it
        let message = "Failed to download PDF. Please try again.";
        if (error.response && error.response.data instanceof Blob) {
            try {
                const text = await error.response.data.text();
                const parsed = JSON.parse(text);
                message = parsed.detail || parsed.error || text || message;
            } catch (e) {
                // Fallback to default message
            }
        } else {
            message = extractErrorMessage(error, message);
        }

        Swal.fire({
            icon: "error",
            title: "Download failed",
            text: message,
            confirmButtonColor: "#dc2626",
        });
    } finally {
        setDownloadingAll(false);
    }
};

    const toggleExpanded = (id) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const getSubjectName = (subjectId) => {
        const id = getClassIdOf(subjectId) ?? subjectId;
        const found = subjects.find((s) => s.id === id);
        return found ? found.name : `Subject #${id}`;
    };

    const selectedClass = classes.find((c) => String(c.id) === String(selectedClassId));

 // Global button: always combines every test timetable that currently
 // exists into a single PDF. Deliberately does NOT depend on
 // selectedTestId (that state belongs to the Add/Edit form only) —
 // that coupling was the bug causing this to silently scope to
 // whatever test was last touched in the form.
 const handleDownloadAllTestPDF = async () => {
  setDownloadingAllTestPdf(true);
  try {
    const response = await api.get("examination/test-timetables/pdf/", {
      headers,
      responseType: "blob",
    });

    downloadBlob(response.data, "all_test_timetables.pdf");

    Swal.fire({
      icon: "success",
      title: "Success!",
      text: "All test timetables PDF downloaded successfully.",
      timer: 2000,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error("Error downloading test timetable PDF:", error);

    let errorMessage = "Failed to download test timetable PDF.";

    if (error.response && error.response.data instanceof Blob) {
      try {
        const errorText = await error.response.data.text();
        errorMessage = errorText || errorMessage;
      } catch (e) {
        // Fallback if blob text reading fails
      }
    }

    Swal.fire({
      icon: "error",
      title: "Download Failed",
      text: errorMessage,
      confirmButtonColor: "#dc2626",
    });
  } finally {
    setDownloadingAllTestPdf(false);
  }
};

 // Per-row button on each test timetable card: downloads the PDF for
 // that row's TEST (i.e. every class assigned to that test), not just
 // the single class of the row that was clicked.
 const handleDownloadTestPdf = async (timetable) => {
  const testId = getClassIdOf(timetable.test);
  setDownloadingTestId(testId);
  try {
    const response = await api.get("examination/test-timetables/pdf/", {
      headers,
      responseType: "blob",
      params: { test: testId },
    });

    const testLabel =
      timetable.test_name ||
      tests.find((t) => String(t.id) === String(testId))?.name ||
      `Test_${testId}`;

    downloadBlob(response.data, `Test_Timetable_${String(testLabel).replace(/\s+/g, "_")}.pdf`);
  } catch (error) {
    console.error("Error downloading test timetable PDF:", error);

    let errorMessage = "Failed to download test timetable PDF.";

    if (error.response && error.response.data instanceof Blob) {
      try {
        const errorText = await error.response.data.text();
        errorMessage = errorText || errorMessage;
      } catch (e) {
        // Fallback if blob text reading fails
      }
    }

    Swal.fire({
      icon: "error",
      title: "Download Failed",
      text: errorMessage,
      confirmButtonColor: "#dc2626",
    });
  } finally {
    setDownloadingTestId(null);
  }
};

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
                <div>
                    <div className="text-3xl font-bold tracking-tight text-[var(--quinary)]">
                        {section === "class" ? "Class Timetable" : "Test Timetable"}
                    </div>
                    <p className="text-gray-500 text-sm mt-1">
                        {section === "class"
                            ? "Manage class timetables — search, filter, create, edit, delete, and export as PDF."
                            : "Manage test timetables — search, filter, create, edit, and delete."}
                    </p>
                </div>
            </div>

            {/* ================= SECTION SWITCHER ================= */}
            <div className="flex items-center gap-2 mb-4 bg-white border border-gray-200 rounded-xl p-1 w-fit">
                <button
                    type="button"
                    onClick={() => setSection("class")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${section === "class"
                        ? "bg-[var(--primary)] text-white"
                        : "text-gray-500 hover:text-[var(--quinary)]"
                        }`}
                >
                    Class Timetable
                </button>
                <button
                    type="button"
                    onClick={() => setSection("test")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${section === "test"
                        ? "bg-[var(--primary)] text-white"
                        : "text-gray-500 hover:text-[var(--quinary)]"
                        }`}
                >
                    Test Timetable
                </button>
            </div>

            {section === "class" && (
                <>
                    {/* Tabs */}
                    <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
                        <button
                            type="button"
                            onClick={() => setActiveTab("list")}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${activeTab === "list"
                                ? "border-[var(--primary)] text-[var(--primary)]"
                                : "border-transparent text-gray-500 hover:text-[var(--quinary)]"
                                }`}
                        >
                            All Timetables
                        </button>
                        <button
                            type="button"
                            onClick={() => (activeTab === "form" ? null : startAddNew())}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${activeTab === "form"
                                ? "border-[var(--primary)] text-[var(--primary)]"
                                : "border-transparent text-gray-500 hover:text-[var(--quinary)]"
                                }`}
                        >
                            {editingId ? "Edit Timetable" : "Add New"}
                        </button>
                    </div>

                    {/* ================= LIST TAB ================= */}
                    {activeTab === "list" && (
                        <div>
                            {listError && (
                                <div className="p-3 rounded-xl text-sm mb-6 text-center border max-w-xl bg-red-50 text-red-700 border-red-200">
                                    {listError}
                                </div>
                            )}

                            {/* Controls */}
                            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search by class name..."
                                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-[var(--primary)] transition-colors text-sm w-64 placeholder-gray-400"
                                    />

                                    <select
                                        value={filterClassId}
                                        onChange={(e) => setFilterClassId(e.target.value)}
                                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                                    >
                                        <option value="">All Classes</option>
                                        {classes.map((cls) => (
                                            <option key={cls.id} value={cls.id}>
                                                {cls.display_name || cls.name}
                                            </option>
                                        ))}
                                    </select>

                                    {(searchTerm || filterClassId) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchTerm("");
                                                setFilterClassId("");
                                            }}
                                            className="text-xs text-gray-500 hover:text-[var(--quinary)] underline cursor-pointer"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleDownloadAllPDF}
                                        disabled={downloadingAll || timetables.length === 0}
                                        className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[var(--quinary)] font-medium py-2.5 px-4 rounded-xl border border-gray-300 transition-colors text-sm cursor-pointer"
                                    >
                                        {downloadingAll ? "Preparing..." : "Download All (PDF)"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={fetchTimetables}
                                        disabled={loadingList}
                                        className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[var(--quinary)] font-medium py-2.5 px-4 rounded-xl border border-gray-300 transition-colors text-sm cursor-pointer"
                                    >
                                        {loadingList ? "Refreshing..." : "Refresh"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={startAddNew}
                                        className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-sm cursor-pointer"
                                    >
                                        + Add New Timetable
                                    </button>
                                </div>
                            </div>

                            {/* List */}
                            {loadingList ? (
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
                                    Loading timetables...
                                </div>
                            ) : timetables.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
                                    {searchTerm || filterClassId
                                        ? "No timetables match your search/filter."
                                        : "No class timetables yet. Click \"Add New Timetable\" to create one."}
                                </div>
                            ) : (
                                <div className="space-y-4 max-w-4xl">
                                    {timetables.map((timetable) => {
                                        const isExpanded = expandedIds.has(timetable.id);
                                        const entryCount = (timetable.entries || []).length;
                                        const label = getClassLabel(timetable.student_class);

                                        // Group entries by day for a readable summary
                                        const entriesByDay = {};
                                        (timetable.entries || []).forEach((entry) => {
                                            if (!entriesByDay[entry.day]) entriesByDay[entry.day] = [];
                                            entriesByDay[entry.day].push(entry);
                                        });

                                        return (
                                            <div
                                                key={timetable.id}
                                                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6"
                                            >
                                                <div className="flex items-start justify-between flex-wrap gap-3">
                                                    <div>
                                                        <div className="text-lg font-semibold text-[var(--quinary)]">
                                                            {label}
                                                        </div>
                                                        <div className="text-xs text-gray-400 mt-1">
                                                            {entryCount} period{entryCount === 1 ? "" : "s"}
                                                            {timetable.updated_at
                                                                ? ` • Updated ${new Date(
                                                                    timetable.updated_at
                                                                ).toLocaleDateString()}`
                                                                : ""}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpanded(timetable.id)}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[var(--quinary)] hover:bg-gray-50 transition-colors cursor-pointer"
                                                        >
                                                            {isExpanded ? "Hide Entries" : "View Entries"}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownloadPDF(timetable)}
                                                            disabled={downloadingId === timetable.id}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[var(--quinary)] hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
                                                        >
                                                            {downloadingId === timetable.id
                                                                ? "Downloading..."
                                                                : "PDF"}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => startEdit(timetable)}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors cursor-pointer"
                                                        >
                                                            Edit
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTarget(timetable)}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                                                        {DAY_OPTIONS.filter(
                                                            (day) => entriesByDay[day.value]
                                                        ).map((day) => (
                                                            <div key={day.value}>
                                                                <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                                                                    {day.label}
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    {[...entriesByDay[day.value]]
                                                                        .sort(
                                                                            (a, b) =>
                                                                                a.period_number -
                                                                                b.period_number
                                                                        )
                                                                        .map((entry) => (
                                                                            <div
                                                                                key={entry.id}
                                                                                className="flex items-center gap-3 flex-wrap text-sm bg-gray-50 rounded-lg px-3 py-2"
                                                                            >
                                                                                <span className="text-gray-400 text-xs w-16 shrink-0">
                                                                                    Period {entry.period_number}
                                                                                </span>
                                                                                <span className="font-medium text-[var(--quinary)]">
                                                                                    {getSubjectName(entry.subject)}
                                                                                </span>
                                                                                <span className="text-gray-500 text-xs">
                                                                                    {formatTimeForInput(entry.start_time)} –{" "}
                                                                                    {formatTimeForInput(entry.end_time)}
                                                                                </span>
                                                                                {entry.room_number && (
                                                                                    <span className="text-gray-400 text-xs">
                                                                                        Room {entry.room_number}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ================= FORM TAB (CREATE / EDIT) ================= */}
                    {activeTab === "form" && (
                        <>
                            {/* Status Message Display */}
                            {message.text && (
                                <div
                                    className={`p-3 rounded-xl text-sm mb-6 text-center border max-w-xl ${message.type === "success"
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
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold block">
                                                Class
                                            </label>
                                            {editingId && (
                                                <span className="text-xs text-[var(--primary)] font-medium">
                                                    Editing timetable
                                                </span>
                                            )}
                                        </div>
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
                                                    {existingClassIds.has(cls.id) &&
                                                        cls.id !== Number(editingOriginalClassId)
                                                        ? " (timetable exists)"
                                                        : ""}
                                                </option>
                                            ))}
                                        </select>

                                        {classAlreadyHasTimetable && (
                                            <p className="text-amber-600 text-xs mt-3">
                                                Class {selectedClass?.name} already has a timetable. Edit
                                                that timetable from "All Timetables", or pick another
                                                class.
                                            </p>
                                        )}
                                    </div>

                                    {/* ---------------- SUBJECT / DAY / PERIOD BUILDER ---------------- */}
                                    {selectedClassId && !classAlreadyHasTimetable && (
                                        <>
                                            {subjectsForClass.length === 0 ? (
                                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm max-w-xl">
                                                    No subjects found for this class. Add subjects to this
                                                    class first.
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
                                                                            className={`text-sm font-medium px-4 py-2 rounded-xl border transition-colors cursor-pointer ${isSelected
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
                                        </>
                                    )}

                                    {/* ---------------- ACTIONS ---------------- */}
                                    {subjectsForClass.length > 0 && !classAlreadyHasTimetable && (
                                        <div className="flex items-center justify-between max-w-4xl">
                                            <span className="text-xs text-gray-400">
                                                {selectedEntryCount} period
                                                {selectedEntryCount === 1 ? "" : "s"} will be saved.
                                            </span>

                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={cancelForm}
                                                    className="text-[var(--quinary)] font-medium py-3 px-6 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors text-sm cursor-pointer"
                                                >
                                                    Cancel
                                                </button>

                                                <button
                                                    type="submit"
                                                    disabled={saving || selectedEntryCount === 0}
                                                    className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
                                                >
                                                    {saving
                                                        ? "Saving..."
                                                        : editingId
                                                            ? "Update Timetable"
                                                            : "Create Timetable"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </form>
                            )}
                        </>
                    )}

                    {/* ================= DELETE CONFIRMATION MODAL ================= */}
                    {deleteTarget && (
                        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                                <div className="text-lg font-semibold text-[var(--quinary)] mb-2">
                                    Delete Timetable?
                                </div>
                                <p className="text-sm text-gray-500 mb-6">
                                    This will permanently delete the timetable for{" "}
                                    <span className="font-medium text-[var(--quinary)]">
                                        {getClassLabel(deleteTarget.student_class)}
                                    </span>{" "}
                                    and all of its entries. This action cannot be undone.
                                </p>
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setDeleteTarget(null)}
                                        disabled={deleting}
                                        className="text-[var(--quinary)] font-medium py-2.5 px-4 rounded-xl border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors text-sm cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        disabled={deleting}
                                        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-sm cursor-pointer"
                                    >
                                        {deleting ? "Deleting..." : "Delete"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ============================================================ */}
            {/* ========================= TEST TIMETABLE ==================== */}
            {/* ============================================================ */}
            {section === "test" && (
                <>
                    <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
                        <button
                            type="button"
                            onClick={() => setTestActiveTab("list")}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${testActiveTab === "list"
                                ? "border-[var(--primary)] text-[var(--primary)]"
                                : "border-transparent text-gray-500 hover:text-[var(--quinary)]"
                                }`}
                        >
                            All Test Timetables
                        </button>
                        <button
                            type="button"
                            onClick={() => (testActiveTab === "form" ? null : startAddNewTest())}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${testActiveTab === "form"
                                ? "border-[var(--primary)] text-[var(--primary)]"
                                : "border-transparent text-gray-500 hover:text-[var(--quinary)]"
                                }`}
                        >
                            {editingTestId ? "Edit Test Timetable" : "Add New"}
                        </button>
                    </div>

                    {testActiveTab === "list" && (
                        <div>
                            {testListError && (
                                <div className="p-3 rounded-xl text-sm mb-6 text-center border max-w-xl bg-red-50 text-red-700 border-red-200">
                                    {testListError}
                                </div>
                            )}

                            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <input
                                        type="text"
                                        value={testSearchTerm}
                                        onChange={(e) => setTestSearchTerm(e.target.value)}
                                        placeholder="Search by test or class..."
                                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-[var(--primary)] transition-colors text-sm w-64 placeholder-gray-400"
                                    />

                                    <select
                                        value={testFilterClassId}
                                        onChange={(e) => setTestFilterClassId(e.target.value)}
                                        className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
                                    >
                                        <option value="">All Classes</option>
                                        {classes.map((cls) => (
                                            <option key={cls.id} value={cls.id}>
                                                {cls.display_name || cls.name}
                                            </option>
                                        ))}
                                    </select>

                                    {(testSearchTerm || testFilterClassId) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTestSearchTerm("");
                                                setTestFilterClassId("");
                                            }}
                                            className="text-xs text-gray-500 hover:text-[var(--quinary)] underline cursor-pointer"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={fetchTestTimetables}
                                        disabled={loadingTestList}
                                        className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[var(--quinary)] font-medium py-2.5 px-4 rounded-xl border border-gray-300 transition-colors text-sm cursor-pointer"
                                    >
                                        {loadingTestList ? "Refreshing..." : "Refresh"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={startAddNewTest}
                                        className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-sm cursor-pointer"
                                    >
                                        + Add New Test Timetable
                                    </button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleDownloadAllTestPDF}
                                        disabled={downloadingAllTestPdf}
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {downloadingAllTestPdf ? (
                                            <>
                                                <HiOutlineArrowPath className="w-4 h-4 animate-spin text-indigo-600" />
                                                <span>Downloading...</span>
                                            </>
                                        ) : (
                                            <>
                                                <HiOutlineArrowDownTray className="w-4 h-4 text-gray-500" />
                                                <span>Download All (PDF)</span>
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={fetchTestTimetables}
                                        title="Refresh"
                                        className="p-2 text-gray-500 bg-white border border-gray-300 rounded-lg shadow-sm hover:text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                                    >
                                        <HiOutlineArrowPath className="w-4 h-4" />
                                    </button>
                                </div>

                            </div>

                            {loadingTestList ? (
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
                                    Loading test timetables...
                                </div>
                            ) : testTimetables.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
                                    {testSearchTerm || testFilterClassId
                                        ? "No test timetables match your search/filter."
                                        : 'No test timetables yet. Click "Add New Test Timetable" to create one.'}
                                </div>
                            ) : (
                                <div className="space-y-4 max-w-4xl">
                                    {testTimetables.map((timetable) => {
                                        const isExpanded = testExpandedIds.has(timetable.id);
                                        const entryCount = (timetable.entries || []).length;
                                        const classLabel =
                                            timetable.student_class_name ||
                                            getClassLabel(timetable.student_class);
                                        const testLabel =
                                            timetable.test_name ||
                                            (typeof timetable.test === "object"
                                                ? timetable.test.name
                                                : tests.find((t) => t.id === timetable.test)?.name) ||
                                            `Test #${getClassIdOf(timetable.test)}`;

                                        const entriesByDate = {};
                                        (timetable.entries || []).forEach((entry) => {
                                            if (!entriesByDate[entry.date]) entriesByDate[entry.date] = [];
                                            entriesByDate[entry.date].push(entry);
                                        });
                                        const sortedDates = Object.keys(entriesByDate).sort();

                                        return (
                                            <div
                                                key={timetable.id}
                                                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6"
                                            >
                                                <div className="flex items-start justify-between flex-wrap gap-3">
                                                    <div>
                                                        <div className="text-lg font-semibold text-[var(--quinary)]">
                                                            {testLabel}
                                                        </div>
                                                        <div className="text-sm text-gray-500 mt-1">
                                                            {classLabel}
                                                        </div>
                                                        <div className="text-xs text-gray-400 mt-1">
                                                            {entryCount} {entryCount === 1 ? "subject" : "subjects"}
                                                            {timetable.updated_at
                                                                ? ` • Updated ${new Date(timetable.updated_at).toLocaleDateString()}`
                                                                : ""}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleTestExpanded(timetable.id)}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[var(--quinary)] hover:bg-gray-50 transition-colors cursor-pointer"
                                                        >
                                                            {isExpanded ? "Hide Entries" : "View Entries"}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownloadTestPdf(timetable)}
                                                            disabled={downloadingTestId === getClassIdOf(timetable.test)}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[var(--quinary)] hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
                                                        >
                                                            {downloadingTestId === getClassIdOf(timetable.test)
                                                                ? "Downloading..."
                                                                : "PDF"}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => startEditTest(timetable)}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors cursor-pointer"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTestTarget(timetable)}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                                                        {sortedDates.map((date) => (
                                                            <div key={date}>
                                                                <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                                                                    {date}
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    {entriesByDate[date].map((entry, i) => (
                                                                        <div
                                                                            key={entry.id ?? i}
                                                                            className="flex items-center gap-3 flex-wrap text-sm bg-gray-50 rounded-lg px-3 py-2"
                                                                        >
                                                                            <span className="font-medium text-[var(--quinary)]">
                                                                                {getSubjectName(entry.subject)}
                                                                            </span>
                                                                            <span className="text-gray-500 text-xs">
                                                                                {formatTimeForInput(entry.start_time)} – {formatTimeForInput(entry.end_time)}
                                                                            </span>
                                                                            {entry.room_number && (
                                                                                <span className="text-gray-400 text-xs">
                                                                                    Room {entry.room_number}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {testActiveTab === "form" && (
                        <form onSubmit={handleTestSubmit} className="space-y-6">
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl space-y-5">
                                <div className="flex items-center justify-between mb-1">
                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                            Test Timetable Details
                                        </div>
                                        <div className="text-sm text-gray-400 mt-1">
                                            Select an existing test, then choose one of its assigned classes.
                                        </div>
                                    </div>
                                    {editingTestId && (
                                        <span className="text-xs text-[var(--primary)] font-medium">
                                            Editing test timetable
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold block mb-1">
                                        Test *
                                    </label>
                                    <select
                                        value={selectedTestId}
                                        onChange={(e) => handleSelectedTestChange(e.target.value)}
                                        disabled={Boolean(editingTestId) || loadingTests}
                                        required
                                        className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer disabled:opacity-60"
                                    >
                                        <option value="">
                                            {loadingTests ? "Loading tests..." : "Select Test"}
                                        </option>
                                        {tests.map((test) => (
                                            <option key={test.id} value={test.id}>
                                                {test.name}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedTest && (
                                        <div className="mt-2 text-xs text-gray-500">
                                            {selectedTest.date ? `Scheduled date: ${selectedTest.date}` : ""}
                                            {selectedTest.description ? ` • ${selectedTest.description}` : ""}
                                        </div>
                                    )}
                                </div>

                                {selectedTestId && (
                                    <div>
                                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold block mb-2">
                                            Classes assigned to this test *
                                        </label>

                                        {assignedClasses.length === 0 ? (
                                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                                                This test has no assigned classes, so a timetable cannot be created for it.
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {assignedClasses.map((cls) => {
                                                    const active = String(selectedTestClassId) === String(cls.id);
                                                    return (
                                                        <button
                                                            key={cls.id}
                                                            type="button"
                                                            onClick={() => handleSelectedTestClassChange(String(cls.id))}
                                                            className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${active
                                                                ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                                                                : "bg-white text-[var(--quinary)] border-gray-300 hover:bg-gray-50"
                                                                }`}
                                                        >
                                                            {cls.display_name || cls.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {selectedTestClassId && (
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                        <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                            Selected class
                                        </div>
                                        <div className="text-base font-semibold text-[var(--quinary)] mt-1">
                                            {selectedTestClass?.display_name || selectedTestClass?.name || `Class #${selectedTestClassId}`}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {subjectsForTestClass.length} {subjectsForTestClass.length === 1 ? "subject" : "subjects"} found for this class.
                                        </div>
                                    </div>
                                )}
                            </div>

                            {selectedTestClassId && (
                                subjectsForTestClass.length === 0 ? (
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm max-w-4xl">
                                        No subjects found for this class. Add subjects to this class first.
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-w-4xl">
                                        {testEntries.map((entry, index) => {
                                            const subject = subjects.find((item) => String(item.id) === String(entry.subject));
                                            return (
                                                <div
                                                    key={subject?.id ?? `extra-${index}`}
                                                    className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6"
                                                >
                                                    <div className="flex items-center justify-between gap-3 mb-4">
                                                        <div>
                                                            <div className="text-lg font-semibold text-[var(--quinary)]">
                                                                {subject?.name || `Subject #${entry.subject}`}
                                                            </div>
                                                            <div className="text-xs text-gray-400 mt-1">
                                                                Configure the examination date and time for this subject.
                                                            </div>
                                                        </div>
                                                        {!subject && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removeTestEntry(index)}
                                                                className="text-xs font-medium px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                                            >
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                        <div>
                                                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold block mb-1">
                                                                Date *
                                                            </label>
                                                            <input
                                                                type="date"
                                                                value={entry.date}
                                                                onChange={(e) => updateTestEntry(index, "date", e.target.value)}
                                                                required
                                                                className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold block mb-1">
                                                                Start Time *
                                                            </label>
                                                            <input
                                                                type="time"
                                                                value={entry.start_time}
                                                                onChange={(e) => updateTestEntry(index, "start_time", e.target.value)}
                                                                required
                                                                className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold block mb-1">
                                                                End Time *
                                                            </label>
                                                            <input
                                                                type="time"
                                                                value={entry.end_time}
                                                                onChange={(e) => updateTestEntry(index, "end_time", e.target.value)}
                                                                required
                                                                className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold block mb-1">
                                                                Room
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={entry.room_number}
                                                                onChange={(e) => updateTestEntry(index, "room_number", e.target.value)}
                                                                placeholder="Optional"
                                                                className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm placeholder-gray-400"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            )}

                            {selectedTestClassId && subjectsForTestClass.length > 0 && (
                                <div className="flex items-center justify-between max-w-4xl">
                                    <span className="text-xs text-gray-400">
                                        {validTestEntries.length} of {testEntries.length} subjects configured.
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={cancelTestForm}
                                            className="text-[var(--quinary)] font-medium py-3 px-6 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors text-sm cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={savingTest || validTestEntries.length !== testEntries.length || testEntries.length === 0}
                                            className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer"
                                        >
                                            {savingTest
                                                ? "Saving..."
                                                : editingTestId
                                                    ? "Update Test Timetable"
                                                    : "Create Test Timetable"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </form>
                    )}

                    {deleteTestTarget && (
                        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                                <div className="text-lg font-semibold text-[var(--quinary)] mb-2">
                                    Delete Test Timetable?
                                </div>
                                <p className="text-sm text-gray-500 mb-6">
                                    This will permanently delete the timetable for{" "}
                                    <span className="font-medium text-[var(--quinary)]">
                                        {deleteTestTarget.test_name || `Test #${getClassIdOf(deleteTestTarget.test)}`}
                                    </span>{" "}
                                    for{" "}
                                    <span className="font-medium text-[var(--quinary)]">
                                        {deleteTestTarget.student_class_name || getClassLabel(deleteTestTarget.student_class)}
                                    </span>{" "}
                                    and all of its entries. This action cannot be undone.
                                </p>
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setDeleteTestTarget(null)}
                                        disabled={deletingTest}
                                        className="text-[var(--quinary)] font-medium py-2.5 px-4 rounded-xl border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors text-sm cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeleteTest}
                                        disabled={deletingTest}
                                        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-sm cursor-pointer"
                                    >
                                        {deletingTest ? "Deleting..." : "Delete"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Examination;