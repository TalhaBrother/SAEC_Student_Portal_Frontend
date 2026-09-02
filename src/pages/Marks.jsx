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

  // Subject-level Total Marks State: { [subjectId]: number | string }
  const [subjectTotals, setSubjectTotals] = useState({});

  // UI Loaders
  const [loading, setLoading] = useState(false);
  const [fetchingSheet, setFetchingSheet] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // Row / Column highlight tracking
  // hoveredRow / hoveredCol = transient (mouse), cleared on mouse leave
  // activeCell = sticky (keyboard/focus), persists until a different cell is focused
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);
  const [activeCell, setActiveCell] = useState({ studentId: null, subjectId: null });

  const setActiveCellFor = (studentId, subjectId) => {
    setActiveCell({ studentId, subjectId });
  };

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
        const grpPromise = api
          .get(`/groups/`, {
            params: { class_id: selectedClass },
            headers: { Authorization: `Bearer ${token}` },
          })
          .catch(() => ({ data: [] }));

        const secPromise = api
          .get(`/sections/`, {
            params: { class_id: selectedClass },
            headers: { Authorization: `Bearer ${token}` },
          })
          .catch(() => ({ data: [] }));

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

      const initialScores = {};
      const initialSubjectTotals = {};

      if (res.data?.students) {
        res.data.students.forEach((std) => {
          std.subjects.forEach((subj) => {
            const key = `${std.student_id}_${subj.subject_id}`;
            
            // Set individual score inputs (obtained_marks & status only)
            initialScores[key] = {
              obtained_marks:
                subj.obtained_marks !== null && subj.obtained_marks !== undefined
                  ? subj.obtained_marks
                  : "",
              status: subj.status || "present",
            };

            // Initialize subject total from API if not set yet
            if (
              subj.total_marks !== undefined &&
              subj.total_marks !== null &&
              !initialSubjectTotals[subj.subject_id]
            ) {
              initialSubjectTotals[subj.subject_id] = subj.total_marks;
            }
          });
        });
      }

      // Fallback to global total if subject total wasn't returned
      if (res.data?.students?.[0]?.subjects) {
        res.data.students[0].subjects.forEach((subj) => {
          if (!initialSubjectTotals[subj.subject_id]) {
            initialSubjectTotals[subj.subject_id] = globalTotalMarks;
          }
        });
      }

      setScoresInput(initialScores);
      setSubjectTotals(initialSubjectTotals);
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
      setSubjectTotals({});
    }
  }, [selectedClass, selectedTest]);

  // Sync all subject totals when Global Total Marks changes
  const handleGlobalTotalChange = (val) => {
    setGlobalTotalMarks(val);
    setSubjectTotals((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((subjId) => {
        updated[subjId] = val;
      });
      return updated;
    });
  };

  // Change total marks for a specific subject column
  const handleSubjectTotalChange = (subjectId, val) => {
    setSubjectTotals((prev) => ({
      ...prev,
      [subjectId]: val,
    }));
  };

  // Handle Score Inputs (obtained marks only)
  const handleScoreChange = (studentId, subjectId, value) => {
    const key = `${studentId}_${subjectId}`;
    setScoresInput((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        status: prev[key]?.status || "present",
        obtained_marks: value,
      },
    }));
  };

  // Toggle Absent/Present status
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
      },
    }));
  };

  // Bulk Save Handler with Client-Side Validation
  const handleSaveBulkMarks = async () => {
    if (!selectedClass || !selectedTest) {
      Swal.fire("Selection Missing", "Please select a Class and Test first.", "warning");
      return;
    }

    if (!marksheetData?.students || marksheetData.students.length === 0) {
      Swal.fire("No Data", "No eligible students available to save marks.", "info");
      return;
    }

    // Client-side validation check
    let validationError = null;

    const studentsPayload = marksheetData.students.map((student) => {
      const studentMarks = student.subjects.map((subj) => {
        const key = `${student.student_id}_${subj.subject_id}`;
        const cellData = scoresInput[key] || {};
        const isAbsent = cellData.status === "absent";
        
        const calculatedTotal = Number(subjectTotals[subj.subject_id] || globalTotalMarks || 100);
        const calculatedObtained = isAbsent
          ? null
          : cellData.obtained_marks !== "" && cellData.obtained_marks !== undefined
          ? Number(cellData.obtained_marks)
          : 0;

        // Check if obtained marks exceeds total marks
        if (!isAbsent && calculatedObtained > calculatedTotal) {
          validationError = `Student "${student.student_name}" has obtained marks (${calculatedObtained}) exceeding total marks (${calculatedTotal}) for ${subj.subject_name}.`;
        }

        return {
          subject_id: Number(subj.subject_id),
          status: cellData.status || "present",
          obtained_marks: calculatedObtained,
          total_marks: calculatedTotal,
        };
      });

      return {
        student_id: Number(student.student_id),
        marks: studentMarks,
      };
    });

    if (validationError) {
      Swal.fire("Validation Error", validationError, "warning");
      return;
    }

    setLoading(true);

    try {
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

      loadMarksheet();
    } catch (err) {
      console.error("Bulk save error:", err?.response?.data || err);
      
      // Parse nested serializer error array structure
      let errMsg = "Failed to submit bulk marks payload.";
      const backendErr = err?.response?.data;

      if (backendErr?.students) {
        for (const stdErr of backendErr.students) {
          if (stdErr?.marks) {
            for (const mErr of stdErr.marks) {
              if (mErr?.non_field_errors?.length) {
                errMsg = mErr.non_field_errors[0];
                break;
              }
            }
          }
        }
      } else if (backendErr?.error) {
        errMsg = backendErr.error;
      }

      Swal.fire("Error", errMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  // Filter test options
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

  // Compute filtered students list
  const filteredStudentsGrid = useMemo(() => {
    if (!marksheetData?.students) return [];

    return marksheetData.students.filter((student) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = student.student_name?.toLowerCase().includes(q);
        const matchesGR = student.student_gr?.toLowerCase().includes(q);
        if (!matchesName && !matchesGR) return false;
      }

      if (selectedSection && student.section !== selectedSection) return false;
      if (selectedGroup && student.group !== selectedGroup) return false;

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

  // Students scoped by Section/Group ONLY — used purely to decide which
  // SUBJECT COLUMNS exist. Deliberately ignores searchQuery/selectedStatus,
  // since those should only hide/show ROWS, not make columns flicker.
  const sectionGroupScopedStudents = useMemo(() => {
    if (!marksheetData?.students) return [];
    return marksheetData.students.filter((student) => {
      if (selectedSection && student.section !== selectedSection) return false;
      if (selectedGroup && student.group !== selectedGroup) return false;
      return true;
    });
  }, [marksheetData, selectedSection, selectedGroup]);

  // Visible subject columns = UNION of every subject any student in the
  // current Test + Class + Section + Group scope is eligible for (not just
  // student[0] — different sections/groups can have different subjects).
  const visibleSubjects = useMemo(() => {
    const source = sectionGroupScopedStudents.length
      ? sectionGroupScopedStudents
      : marksheetData?.students || [];

    const bySubjectId = new Map();
    source.forEach((student) => {
      (student.subjects || []).forEach((subj) => {
        if (!bySubjectId.has(subj.subject_id)) {
          bySubjectId.set(subj.subject_id, subj);
        }
      });
    });

    let union = Array.from(bySubjectId.values());

    if (selectedSubject) {
      union = union.filter((s) => Number(s.subject_id) === Number(selectedSubject));
    }

    return union;
  }, [sectionGroupScopedStudents, marksheetData, selectedSubject]);

  // Effective highlight targets: live mouse hover wins, otherwise fall back
  // to the "sticky" cell that currently has focus.
  const effectiveRow = hoveredRow ?? activeCell.studentId;
  const effectiveCol = hoveredCol ?? activeCell.subjectId;

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

          {/* Global Default Total Marks */}
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Set All Total Marks
            </label>
            <input
              type="number"
              min="1"
              value={globalTotalMarks}
              onChange={(e) => handleGlobalTotalChange(e.target.value)}
              className="bg-[var(--secondary)] text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 outline-none focus:border-[var(--primary)] text-sm font-semibold text-center"
              placeholder="e.g. 100"
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
                  
                  {/* Column Header per Subject with dynamic Total Marks control */}
                  {visibleSubjects.map((subj) => {
                    const colActive = effectiveCol === subj.subject_id;
                    return (
                      <th
                        key={subj.subject_id}
                        onMouseEnter={() => setHoveredCol(subj.subject_id)}
                        onMouseLeave={() => setHoveredCol(null)}
                        className={`p-4 text-center min-w-[170px] border-l border-gray-200 transition-colors duration-150 ${
                          colActive
                            ? "bg-blue-100 shadow-[inset_0_-2px_0_0_var(--primary)]"
                            : "bg-blue-50"
                        }`}
                      >
                        <div className={`font-bold mb-1.5 ${colActive ? "text-[var(--primary)]" : "text-[var(--quinary)]"}`}>
                          {subj.subject_name}
                        </div>

                        <div className="flex items-center justify-center gap-1.5 font-normal normal-case">
                          <span className="text-[11px] text-gray-500">Total:</span>
                          <input
                            type="number"
                            min="1"
                            value={subjectTotals[subj.subject_id] ?? globalTotalMarks}
                            onChange={(e) => handleSubjectTotalChange(subj.subject_id, e.target.value)}
                            className="w-16 bg-white border border-gray-300 rounded-md py-0.5 px-1.5 text-center text-xs font-bold text-[var(--primary)] shadow-sm outline-none focus:border-[var(--primary)]"
                          />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredStudentsGrid.length > 0 ? (
                  filteredStudentsGrid.map((student, rowIdx) => {
                    const rowActive = effectiveRow === student.student_id;
                    // Zebra banding for rows that aren't currently active
                    const rowBgClass = rowActive
                      ? "bg-blue-50"
                      : rowIdx % 2 === 1
                      ? "bg-gray-50"
                      : "bg-white";

                    return (
                      <tr
                        key={student.student_id}
                        onMouseEnter={() => setHoveredRow(student.student_id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        className={`transition-colors duration-150 ${
                          rowActive ? "shadow-[inset_2px_0_0_0_var(--primary)]" : ""
                        }`}
                      >
                        {/* GR Number */}
                        <td
                          onMouseEnter={() => setHoveredRow(student.student_id)}
                          className={`p-4 font-semibold text-gray-500 sticky left-0 z-10 border-r border-gray-100 transition-colors duration-150 ${rowBgClass}`}
                        >
                          {student.student_gr}
                        </td>

                        {/* Student Name */}
                        <td
                          onMouseEnter={() => setHoveredRow(student.student_id)}
                          className={`p-4 font-bold text-[var(--quinary)] sticky left-16 z-10 border-r border-gray-100 transition-colors duration-150 ${rowBgClass}`}
                        >
                          {student.student_name}
                        </td>

                        {/* Section & Group Tags */}
                        <td
                          onMouseEnter={() => setHoveredRow(student.student_id)}
                          className={`p-4 text-xs text-gray-500 whitespace-nowrap transition-colors duration-150 ${rowBgClass}`}
                        >
                          <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium mr-1">
                            {student.section || "N/A"}
                          </span>
                          <span className="bg-blue-50 text-[var(--primary)] px-2 py-0.5 rounded font-medium">
                            {student.group || "Gen"}
                          </span>
                        </td>

                        {/* Subject Mark Inputs Dynamic Cells */}
                        {visibleSubjects.map((subj) => {
                          // Not every student is eligible for every column once
                          // columns are the UNION across section/group — check
                          // whether THIS student actually takes this subject.
                          const studentTakesSubject = (student.subjects || []).some(
                            (s) => s.subject_id === subj.subject_id
                          );

                          const colActive = effectiveCol === subj.subject_id;
                          const cellActive = rowActive && colActive;

                          // Column tint layers on top of the row's zebra/active background.
                          // Intersection (row + col both active) gets the strongest tint.
                          let cellBgClass = rowBgClass;
                          if (colActive) {
                            cellBgClass = cellActive ? "bg-indigo-100" : "bg-indigo-50";
                          }

                          // Ineligible cell: greyed-out, disabled "N/A" placeholder.
                          if (!studentTakesSubject) {
                            return (
                              <td
                                key={subj.subject_id}
                                onMouseEnter={() => {
                                  setHoveredRow(student.student_id);
                                  setHoveredCol(subj.subject_id);
                                }}
                                onMouseLeave={() => setHoveredCol(null)}
                                className={`p-3 text-center border-l border-gray-100 transition-colors duration-150 ${cellBgClass}`}
                              >
                                <span className="inline-block px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs font-semibold border border-gray-200 cursor-not-allowed select-none">
                                  N/A
                                </span>
                              </td>
                            );
                          }

                          const cellKey = `${student.student_id}_${subj.subject_id}`;
                          const currentCell = scoresInput[cellKey] || {
                            obtained_marks: "",
                            status: "present",
                          };
                          const isAbsent = currentCell.status === "absent";
                          const maxTotal = subjectTotals[subj.subject_id] || globalTotalMarks;

                          return (
                            <td
                              key={subj.subject_id}
                              onMouseEnter={() => {
                                setHoveredRow(student.student_id);
                                setHoveredCol(subj.subject_id);
                              }}
                              onMouseLeave={() => setHoveredCol(null)}
                              className={`p-3 text-center border-l border-gray-100 transition-colors duration-150 ${cellBgClass} ${
                                cellActive ? "ring-2 ring-inset ring-[var(--primary)]/40" : ""
                              }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                {/* Attendance Status Toggle Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    toggleAttendanceStatus(student.student_id, subj.subject_id);
                                    setActiveCellFor(student.student_id, subj.subject_id);
                                  }}
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
                                  max={maxTotal}
                                  value={isAbsent ? "" : currentCell.obtained_marks}
                                  onFocus={() => setActiveCellFor(student.student_id, subj.subject_id)}
                                  onChange={(e) =>
                                    handleScoreChange(
                                      student.student_id,
                                      subj.subject_id,
                                      e.target.value
                                    )
                                  }
                                  className={`w-20 border rounded-lg p-1.5 text-center font-semibold text-sm outline-none transition-all ${
                                    isAbsent
                                      ? "bg-gray-100 text-gray-400 border-gray-200"
                                      : "bg-white text-[var(--quinary)] border-gray-300 focus:border-[var(--primary)]"
                                  }`}
                                />

                                <span className="text-gray-400 text-xs font-medium">/</span>

                                {/* Static Display of Subject's Uniform Total Marks */}
                                <span className="text-xs font-bold text-gray-500 w-8 text-left">
                                  {maxTotal}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
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