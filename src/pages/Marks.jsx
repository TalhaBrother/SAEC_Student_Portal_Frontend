import React, { useEffect, useState, useMemo } from "react";
import useAuthStore from "../store/authStore";
import api from "../api/axios";
import Swal from "sweetalert2";

const Marks = () => {
  const token = useAuthStore((state) => state.accessToken);

  // Core Data Collections
  const [classes, setClasses] = useState([]);
  const [tests, setTests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // Filter & Selection State
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedTest, setSelectedTest] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedBoard, setSelectedBoard] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Marksheet Grid State
  const [marksheetData, setMarksheetData] = useState(null);
  const [scoresInput, setScoresInput] = useState({});
  const [globalTotalMarks, setGlobalTotalMarks] = useState("100");

  // UI Loaders
  const [loading, setLoading] = useState(false);
  const [fetchingSheet, setFetchingSheet] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // Fetch initial dropdown metadata
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [clsRes, testRes, subRes] = await Promise.all([
          api.get("/classes/", { headers: { Authorization: `Bearer ${token}` } }),
          api.get("/tests/", { headers: { Authorization: `Bearer ${token}` } }),
          api.get("/subjects/", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setClasses(clsRes.data);
        setTests(testRes.data);
        setSubjects(subRes.data);
      } catch (err) {
        console.error("Failed to fetch initial metadata:", err);
      }
    };

    if (token) fetchMetadata();
  }, [token]);

// Fetch contextual Groups & Sections when Selected Class changes
useEffect(() => {
  const fetchClassSubContext = async () => {
    if (!selectedClass) {
      setGroups([]);
      setSections([]);
      return;
    }

    setGroupsLoading(true);

    try {
      // Adjust path if your app routes them under /api/students/ or similar
      const grpPromise = api
        .get(`/students/groups/`, {
          params: { class_id: selectedClass },
          headers: { Authorization: `Bearer ${token}` },
        })
        .catch(() => ({ data: [] })); // Fallback safely if route differs

      const secPromise = api
        .get(`/students/sections/`, {
          params: { class_id: selectedClass },
          headers: { Authorization: `Bearer ${token}` },
        })
        .catch(() => ({ data: [] })); // Fallback safely if route differs

      const [grpRes, secRes] = await Promise.all([grpPromise, secPromise]);

      setGroups(grpRes.data || []);
      setSections(secRes.data || []);
    } catch (err) {
      console.error("Failed to fetch contextual class groups/sections:", err);
      setGroups([]);
      setSections([]);
    } finally {
      setGroupsLoading(false);
    }
  };

  setSelectedGroup("");
  setSelectedSection("");
  if (token) fetchClassSubContext();
}, [selectedClass, token]);

  // Load backend marksheet data when Class and Test are both active
  const loadMarksheet = async () => {
    if (!selectedClass || !selectedTest) return;

    setFetchingSheet(true);
    try {
      const res = await api.get(
        `/marks/marksheet/?test_id=${selectedTest}&class_id=${selectedClass}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMarksheetData(res.data);

      // Hydrate score input matrix from existing mark records
      const initialScores = {};
      if (res.data?.students) {
        res.data.students.forEach((std) => {
          std.subjects.forEach((subj) => {
            const key = `${std.student_id}_${subj.subject_id}`;
            initialScores[key] = {
              obtained_marks:
                subj.obtained_marks !== null && subj.obtained_marks !== undefined
                  ? subj.obtained_marks
                  : "",
              total_marks: subj.total_marks || globalTotalMarks,
              status: subj.status || "present",
            };
          });
        });
      }
      setScoresInput(initialScores);
    } catch (err) {
      console.error("Failed to load marksheet:", err);
      setMarksheetData(null);
    } finally {
      setFetchingSheet(false);
    }
  };

  useEffect(() => {
    if (selectedClass && selectedTest) {
      loadMarksheet();
    } else {
      setMarksheetData(null);
      setScoresInput({});
    }
  }, [selectedClass, selectedTest]);

  // Handle Score Inputs inside Matrix
  const handleScoreChange = (studentId, subjectId, field, value) => {
    const key = `${studentId}_${subjectId}`;
    setScoresInput((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        status: prev[key]?.status || "present",
        obtained_marks: prev[key]?.obtained_marks ?? "",
        total_marks: prev[key]?.total_marks || globalTotalMarks,
        [field]: value,
      },
    }));
  };

  // Toggle Absent/Present status for specific cell
  const toggleAttendanceStatus = (studentId, subjectId) => {
    const key = `${studentId}_${subjectId}`;
    const currentStatus = scoresInput[key]?.status || "present";
    const nextStatus = currentStatus === "present" ? "absent" : "present";

    setScoresInput((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        status: nextStatus,
        obtained_marks: nextStatus === "absent" ? "" : prev[key]?.obtained_marks || "",
        total_marks: prev[key]?.total_marks || globalTotalMarks,
      },
    }));
  };

  // Bulk Save Handler (Constructs backend payload)
  const handleSaveBulkMarks = async () => {
    if (!selectedClass || !selectedTest) {
      Swal.fire("Selection Missing", "Please select a Class and Test first.", "warning");
      return;
    }

    if (!marksheetData?.students || marksheetData.students.length === 0) {
      Swal.fire("No Data", "No eligible students available to save marks.", "info");
      return;
    }

    setLoading(true);

    try {
      // Build students array formatted for BulkMarkSerializer
      const studentsPayload = marksheetData.students.map((student) => {
        const studentMarks = student.subjects.map((subj) => {
          const key = `${student.student_id}_${subj.subject_id}`;
          const cellData = scoresInput[key] || {};
          const isAbsent = cellData.status === "absent";

          return {
            subject_id: Number(subj.subject_id),
            status: cellData.status || "present",
            obtained_marks: isAbsent
              ? null
              : cellData.obtained_marks !== "" && cellData.obtained_marks !== undefined
              ? Number(cellData.obtained_marks)
              : 0,
            total_marks: Number(cellData.total_marks || globalTotalMarks),
          };
        });

        return {
          student_id: Number(student.student_id),
          marks: studentMarks,
        };
      });

      const payload = {
        test_id: Number(selectedTest),
        class_id: Number(selectedClass),
        students: studentsPayload,
      };

      const res = await api.post("/marks/bulk/", payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      Swal.fire({
        title: "Success!",
        text: `Marks synchronized! (${res.data.created || 0} created, ${res.data.updated || 0} updated)`,
        icon: "success",
        confirmButtonColor: "#0056D2",
        background: "#F4F7FC",
        color: "#1A253C",
      });

      // Reload fresh marksheet
      loadMarksheet();
    } catch (err) {
      console.error("Bulk save error:", err?.response?.data || err);
      const errMsg =
        err?.response?.data?.error ||
        err?.response?.data?.non_field_errors?.[0] ||
        "Failed to submit bulk marks payload.";
      Swal.fire("Error", errMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  // Filter test selection by board or class
  const filteredTestOptions = useMemo(() => {
    return tests.filter((t) => {
      if (selectedClass) {
        const hasClass = t.classes_detail?.some((c) => c.id === Number(selectedClass));
        if (!hasClass) return false;
      }
      if (selectedBoard) {
        const hasBoard = t.classes_detail?.some((c) => c.board === selectedBoard);
        if (!hasBoard) return false;
      }
      return true;
    });
  }, [tests, selectedClass, selectedBoard]);

  // Compute filtered students list within active marksheet matrix
  const filteredStudentsGrid = useMemo(() => {
    if (!marksheetData?.students) return [];

    return marksheetData.students.filter((student) => {
      // 1. Search Query (Name or Student GR)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = student.student_name?.toLowerCase().includes(q);
        const matchesGR = student.student_gr?.toLowerCase().includes(q);
        if (!matchesName && !matchesGR) return false;
      }

      // 2. Section Filter
      if (selectedSection) {
        if (student.section !== selectedSection) return false;
      }

      // 3. Group Filter
      if (selectedGroup) {
        if (student.group !== selectedGroup) return false;
      }

      // 4. Status Filter
      if (selectedStatus) {
        const matchStatus = student.subjects.some((subj) => {
          const key = `${student.student_id}_${subj.subject_id}`;
          return (scoresInput[key]?.status || "present") === selectedStatus;
        });
        if (!matchStatus) return false;
      }

      return true;
    });
  }, [
    marksheetData,
    searchQuery,
    selectedSection,
    selectedGroup,
    selectedStatus,
    scoresInput,
  ]);

  // Filter visible columns dynamically if Subject Filter is applied
  const visibleSubjects = useMemo(() => {
    if (!marksheetData?.students?.[0]?.subjects) return [];
    if (!selectedSubject) return marksheetData.students[0].subjects;

    return marksheetData.students[0].subjects.filter(
      (s) => Number(s.subject_id) === Number(selectedSubject)
    );
  }, [marksheetData, selectedSubject]);

  return (
    <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--quinary)]">
            Marksheet & Grade Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Bulk enter assessment marks, manage attendance statuses, and update student performance sheets.
          </p>
        </div>

        {selectedClass && selectedTest && (
          <button
            onClick={handleSaveBulkMarks}
            disabled={loading || fetchingSheet}
            className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-semibold px-6 py-3 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] disabled:opacity-50 text-sm"
          >
            {loading ? "Saving Changes..." : "Save Sheet Records"}
          </button>
        )}
      </div>

      {/* Filter & Selector Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6 space-y-4">
        {/* Step 1 Selector Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Class Select */}
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Class <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedTest("");
              }}
              className="bg-[var(--secondary)] text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 outline-none focus:border-[var(--primary)] text-sm cursor-pointer font-medium"
            >
              <option value="">Choose Target Class</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.display_name}
                </option>
              ))}
            </select>
          </div>

          {/* Test Select */}
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Test / Assessment <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedTest}
              onChange={(e) => setSelectedTest(e.target.value)}
              disabled={!selectedClass}
              className="bg-[var(--secondary)] text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 outline-none focus:border-[var(--primary)] text-sm cursor-pointer disabled:opacity-50 font-medium"
            >
              <option value="">Choose Assessment</option>
              {filteredTestOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.date})
                </option>
              ))}
            </select>
          </div>

          {/* Global Total Marks Override */}
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Default Total Marks
            </label>
            <input
              type="number"
              min="1"
              value={globalTotalMarks}
              onChange={(e) => setGlobalTotalMarks(e.target.value)}
              className="bg-[var(--secondary)] text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 outline-none focus:border-[var(--primary)] text-sm font-semibold text-center"
            />
          </div>

          {/* Search Input */}
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Search Student / GR
            </label>
            <input
              type="text"
              placeholder="Search Name or GR..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--secondary)] text-[var(--quinary)] px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:border-[var(--primary)] text-sm"
            />
          </div>
        </div>

        {/* Extended Criteria Filters */}
        <div className="pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Group Filter */}
          <div>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              disabled={!selectedClass || groupsLoading}
              className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-gray-700 outline-none focus:border-[var(--primary)]"
            >
              <option value="">All Groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              disabled={!selectedClass}
              className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-gray-700 outline-none focus:border-[var(--primary)]"
            >
              <option value="">All Sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Filter */}
          <div>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              disabled={!selectedClass}
              className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-gray-700 outline-none focus:border-[var(--primary)]"
            >
              <option value="">All Subjects</option>
              {subjects
                .filter(
                  (s) =>
                    s.student_class === Number(selectedClass) ||
                    s.student_class?.id === Number(selectedClass)
                )
                .map((subj) => (
                  <option key={subj.id} value={subj.id}>
                    {subj.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-gray-700 outline-none focus:border-[var(--primary)]"
            >
              <option value="">All Statuses</option>
              <option value="present">Present Only</option>
              <option value="absent">Absent Only</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div>
            <button
              onClick={() => {
                setSelectedGroup("");
                setSelectedSection("");
                setSelectedSubject("");
                setSelectedStatus("");
                setSearchQuery("");
              }}
              className="w-full text-xs font-semibold text-gray-600 hover:text-[var(--primary)] bg-gray-50 hover:bg-gray-100 p-2 rounded-lg transition-colors border border-gray-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Main Bulk Sheet Viewport */}
      {fetchingSheet ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-gray-500 text-sm font-medium animate-pulse">Loading class marksheet matrix...</p>
        </div>
      ) : selectedClass && selectedTest && marksheetData ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--secondary)] border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-600">
                  <th className="p-4 sticky left-0 bg-[var(--secondary)] z-10 w-16">GR #</th>
                  <th className="p-4 sticky left-16 bg-[var(--secondary)] z-10 min-w-[200px]">Student Name</th>
                  <th className="p-4">Sec / Group</th>
                  {visibleSubjects.map((subj) => (
                    <th key={subj.subject_id} className="p-4 text-center min-w-[160px]">
                      <div className="font-bold text-[var(--quinary)]">{subj.subject_name}</div>
                      <div className="text-[10px] text-gray-400 font-normal">Score / Total</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredStudentsGrid.length > 0 ? (
                  filteredStudentsGrid.map((student) => (
                    <tr key={student.student_id} className="hover:bg-blue-50/30 transition-colors">
                      {/* GR Number */}
                      <td className="p-4 font-semibold text-gray-500 sticky left-0 bg-white z-10 border-r border-gray-100">
                        {student.student_gr}
                      </td>

                      {/* Student Name */}
                      <td className="p-4 font-bold text-[var(--quinary)] sticky left-16 bg-white z-10 border-r border-gray-100">
                        {student.student_name}
                      </td>

                      {/* Section & Group Tags */}
                      <td className="p-4 text-xs text-gray-500 whitespace-nowrap">
                        <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium mr-1">
                          {student.section || "N/A"}
                        </span>
                        <span className="bg-blue-50 text-[var(--primary)] px-2 py-0.5 rounded font-medium">
                          {student.group || "Gen"}
                        </span>
                      </td>

                      {/* Subject Mark Inputs Dynamic Cells */}
                      {visibleSubjects.map((subj) => {
                        const cellKey = `${student.student_id}_${subj.subject_id}`;
                        const currentCell = scoresInput[cellKey] || {
                          obtained_marks: "",
                          total_marks: globalTotalMarks,
                          status: "present",
                        };
                        const isAbsent = currentCell.status === "absent";

                        return (
                          <td key={subj.subject_id} className="p-3 text-center border-l border-gray-50">
                            <div className="flex items-center justify-center gap-2">
                              {/* Attendance Status Toggle Button */}
                              <button
                                type="button"
                                onClick={() => toggleAttendanceStatus(student.student_id, subj.subject_id)}
                                title={isAbsent ? "Mark Present" : "Mark Absent"}
                                className={`px-2 py-1 rounded-lg border text-xs font-bold transition-colors ${
                                  isAbsent
                                    ? "bg-red-50 border-red-200 text-red-600"
                                    : "bg-emerald-50 border-emerald-200 text-emerald-600"
                                }`}
                              >
                                {isAbsent ? "ABS" : "P"}
                              </button>

                              {/* Obtained Score Input */}
                              <input
                                type="number"
                                disabled={isAbsent}
                                placeholder={isAbsent ? "ABS" : "0"}
                                min="0"
                                max={currentCell.total_marks || globalTotalMarks}
                                value={isAbsent ? "" : currentCell.obtained_marks}
                                onChange={(e) =>
                                  handleScoreChange(
                                    student.student_id,
                                    subj.subject_id,
                                    "obtained_marks",
                                    e.target.value
                                  )
                                }
                                className={`w-16 border rounded-lg p-1.5 text-center font-semibold text-sm outline-none transition-all ${
                                  isAbsent
                                    ? "bg-gray-100 text-gray-400 border-gray-200"
                                    : "bg-white text-[var(--quinary)] border-gray-300 focus:border-[var(--primary)]"
                                }`}
                              />

                              <span className="text-gray-400 text-xs">/</span>

                              {/* Total Marks Input */}
                              <input
                                type="number"
                                min="1"
                                value={currentCell.total_marks || globalTotalMarks}
                                onChange={(e) =>
                                  handleScoreChange(
                                    student.student_id,
                                    subj.subject_id,
                                    "total_marks",
                                    e.target.value
                                  )
                                }
                                className="w-14 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg p-1 text-center text-xs outline-none focus:border-[var(--primary)]"
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3 + visibleSubjects.length} className="p-10 text-center text-gray-400">
                      No matching student entries found for current query filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Actions */}
          <div className="p-4 bg-[var(--secondary)] border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-gray-500">
            <div>
              Showing <span className="font-bold text-[var(--quinary)]">{filteredStudentsGrid.length}</span> students across{" "}
              <span className="font-bold text-[var(--quinary)]">{visibleSubjects.length}</span> subjects.
            </div>
            <button
              onClick={handleSaveBulkMarks}
              disabled={loading}
              className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm disabled:opacity-50"
            >
              Save Sheet Records
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-16 text-center">
          <h3 className="text-lg font-bold text-[var(--quinary)]">No Class & Assessment Selected</h3>
          <p className="text-gray-400 text-sm mt-1 max-w-md mx-auto">
            Please select a Class and an Assessment Test from the top control panel to initialize the student marksheet matrix.
          </p>
        </div>
      )}
    </div>
  );
};

export default Marks;