import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isEmptyValue = (val) => {
    if (val === null || val === undefined || val === '') return true;
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val === 'object') return Object.keys(val).length === 0;
    return false;
};

// Pulls a human-readable message out of whatever shape DRF sends back
// (string, list, or nested object of lists).
const extractApiError = (errorData) => {
    if (isEmptyValue(errorData)) return '';
    if (typeof errorData === 'string') return errorData;

    if (Array.isArray(errorData)) {
        return errorData
            .map((item) => extractApiError(item))
            .filter((msg) => msg)
            .join(' ');
    }

    if (typeof errorData === 'object') {
        const parts = Object.keys(errorData)
            .map((key) => {
                const msg = extractApiError(errorData[key]);
                if (!msg) return '';
                const label = key === 'non_field_errors' || key === 'detail' ? '' : `${key}: `;
                return `${label}${msg}`;
            })
            .filter((msg) => msg);
        return parts.join(' | ');
    }

    return String(errorData);
};

const formatApiError = (errorData) =>
    extractApiError(errorData) || 'Something went wrong. Please try again.';

const MODE_SINGLE = 'single';
const MODE_MULTIPLE = 'multiple';
const MODE_ALL = 'all';

const emptyFormData = {
    name: '',
    mode: MODE_SINGLE,
    selectedClassIds: [],
    selectedSections: [], // flat list of Section ids, merged across every class panel
    selectedGroups: [],   // flat list of Group ids, merged across every class panel
    date: '',
    description: '',
};

const MONTH_OPTIONS = [
    { value: '1', label: 'January' }, { value: '2', label: 'February' },
    { value: '3', label: 'March' }, { value: '4', label: 'April' },
    { value: '5', label: 'May' }, { value: '6', label: 'June' },
    { value: '7', label: 'July' }, { value: '8', label: 'August' },
    { value: '9', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

const Tests = () => {
    const token = useAuthStore((state) => state.accessToken);

    // Data States
    const [tests, setTests] = useState([]);
    const [classes, setClasses] = useState([]);
    const [sections, setSections] = useState([]);
    const [groups, setGroups] = useState([]);

    // Search & Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBoard, setSelectedBoard] = useState('');
    const [selectedClassFilter, setSelectedClassFilter] = useState('');
    const [selectedSectionFilter, setSelectedSectionFilter] = useState('');
    const [selectedGroupFilter, setSelectedGroupFilter] = useState('');
    const [selectedDateFilter, setSelectedDateFilter] = useState('');
    const [selectedMonthFilter, setSelectedMonthFilter] = useState('');

    // Table expand state (per-class breakdown of a test's sections/groups)
    const [expandedTests, setExpandedTests] = useState(new Set());

    // Modal & Form States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTest, setEditingTest] = useState(null);
    const [formData, setFormData] = useState(emptyFormData);

    // Per-class sections/groups option cache, shared by the modal's
    // expandable panels AND the table's expandable per-class breakdown.
    // { [classId]: { sections: [], groups: [], loading, loaded } }
    const [classOptions, setClassOptions] = useState({});
    const [expandedFormClasses, setExpandedFormClasses] = useState(new Set());

    // UI & Loading States
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Toast Notification helper
    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 4500);
    };

    // 1. Fetch Classes for filter dropdown & form selector
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const res = await api.get('/classes/', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setClasses(res.data || []);
            } catch (err) {
                console.error('Error fetching classes:', err);
            }
        };
        if (token) fetchClasses();
    }, [token]);

    // 2. Dynamic Fetching of Filter Dependent Dropdowns (Sections/Groups)
    useEffect(() => {
        const fetchFilterOptions = async () => {
            if (!selectedClassFilter) {
                setSections([]);
                setGroups([]);
                setSelectedSectionFilter('');
                setSelectedGroupFilter('');
                return;
            }

            try {
                const [secRes, grpRes] = await Promise.all([
                    api.get(`/sections/?class_id=${selectedClassFilter}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }).catch(() => ({ data: [] })),
                    api.get(`/groups/?class_id=${selectedClassFilter}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }).catch(() => ({ data: [] }))
                ]);

                setSections(secRes.data || []);
                setGroups(grpRes.data || []);
            } catch (err) {
                console.error('Error fetching dependent options:', err);
            }
        };

        if (token) fetchFilterOptions();
    }, [selectedClassFilter, token]);

    // 3. Fetch Tests with Search & Backend Filters
    const fetchTests = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchTerm.trim()) params.append('search', searchTerm.trim());
            if (selectedBoard) params.append('board', selectedBoard);
            if (selectedClassFilter) params.append('class_id', selectedClassFilter);
            if (selectedSectionFilter) params.append('section_id', selectedSectionFilter);
            if (selectedGroupFilter) params.append('group_id', selectedGroupFilter);
            if (selectedDateFilter) params.append('date', selectedDateFilter);
            if (selectedMonthFilter) params.append('month', selectedMonthFilter);

            const res = await api.get(`/tests/?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setTests(res.data || []);
        } catch (err) {
            console.error('Error fetching tests:', err);
            showMessage('error', 'Failed to fetch tests list.');
        } finally {
            setLoading(false);
        }
    }, [token, searchTerm, selectedBoard, selectedClassFilter, selectedSectionFilter, selectedGroupFilter, selectedDateFilter, selectedMonthFilter]);

    useEffect(() => {
        if (token) {
            const debounceTimer = setTimeout(() => {
                fetchTests();
            }, 300);
            return () => clearTimeout(debounceTimer);
        }
    }, [fetchTests, token]);

    // -----------------------------------------------------------------
    // Shared per-class sections/groups cache
    // (used by both the modal's per-class panels and the table's
    // expandable per-class breakdown of an existing test)
    // -----------------------------------------------------------------

    const classFetchTracker = useRef(new Set());

    const ensureClassOptions = useCallback(async (classId) => {
        if (!classId || classFetchTracker.current.has(String(classId))) return;
        classFetchTracker.current.add(String(classId));

        setClassOptions((prev) => ({
            ...prev,
            [classId]: { sections: [], groups: [], loading: true, loaded: false },
        }));

        try {
            const [secRes, grpRes] = await Promise.all([
                api.get(`/sections/?class_id=${classId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }).catch(() => ({ data: [] })),
                api.get(`/groups/?class_id=${classId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }).catch(() => ({ data: [] }))
            ]);

            setClassOptions((prev) => ({
                ...prev,
                [classId]: {
                    sections: secRes.data || [],
                    groups: grpRes.data || [],
                    loading: false,
                    loaded: true,
                },
            }));
        } catch (err) {
            console.error('Error loading class options:', err);
            setClassOptions((prev) => ({
                ...prev,
                [classId]: { sections: [], groups: [], loading: false, loaded: true },
            }));
        }
    }, [token]);

    // -----------------------------------------------------------------
    // Table: expand a test row to see its sections/groups broken down
    // per assigned class (client-side, since Test stores them flat).
    // -----------------------------------------------------------------

    const toggleTestExpand = (test) => {
        setExpandedTests((prev) => {
            const next = new Set(prev);
            if (next.has(test.id)) {
                next.delete(test.id);
            } else {
                next.add(test.id);
                (test.classes_detail || []).forEach((cls) => ensureClassOptions(cls.id));
            }
            return next;
        });
    };

    // -----------------------------------------------------------------
    // Modal: assignment mode + per-class expandable panels
    // -----------------------------------------------------------------

    const getFormClassIds = () => formData.selectedClassIds;

    const toggleFormClassExpand = (classId) => {
        setExpandedFormClasses((prev) => {
            const next = new Set(prev);
            if (next.has(classId)) {
                next.delete(classId);
            } else {
                next.add(classId);
                ensureClassOptions(classId);
            }
            return next;
        });
    };

    const handleModeChange = (mode) => {
        if (mode === MODE_ALL) {
            const allIds = classes.map((c) => c.id);
            setFormData((prev) => ({
                ...prev,
                mode,
                selectedClassIds: allIds,
                selectedSections: [],
                selectedGroups: [],
            }));
        } else {
            setFormData((prev) => ({
                ...prev,
                mode,
                selectedClassIds: [],
                selectedSections: [],
                selectedGroups: [],
            }));
        }
        setExpandedFormClasses(new Set());
    };

    // Single-mode class dropdown
    const handleSingleClassSelect = (classId) => {
        setFormData((prev) => ({
            ...prev,
            selectedClassIds: classId ? [Number(classId)] : [],
            selectedSections: [],
            selectedGroups: [],
        }));
        if (classId) {
            ensureClassOptions(classId);
            setExpandedFormClasses(new Set([Number(classId)]));
        } else {
            setExpandedFormClasses(new Set());
        }
    };

    // Multiple-mode class checkbox toggle
    const toggleMultipleClass = (classId) => {
        const id = Number(classId);
        setFormData((prev) => {
            const isSelected = prev.selectedClassIds.includes(id);
            const selectedClassIds = isSelected
                ? prev.selectedClassIds.filter((c) => c !== id)
                : [...prev.selectedClassIds, id];

            // If a class is deselected, drop any sections/groups that
            // belonged only to that class from the flat selections.
            let selectedSections = prev.selectedSections;
            let selectedGroups = prev.selectedGroups;
            if (isSelected) {
                const classSectionIds = new Set((classOptions[id]?.sections || []).map((s) => s.id));
                const classGroupIds = new Set((classOptions[id]?.groups || []).map((g) => g.id));
                selectedSections = prev.selectedSections.filter((sid) => !classSectionIds.has(sid));
                selectedGroups = prev.selectedGroups.filter((gid) => !classGroupIds.has(gid));
            }

            return { ...prev, selectedClassIds, selectedSections, selectedGroups };
        });
    };

    const toggleSection = (sectionId) => {
        setFormData((prev) => {
            const has = prev.selectedSections.includes(sectionId);
            return {
                ...prev,
                selectedSections: has
                    ? prev.selectedSections.filter((id) => id !== sectionId)
                    : [...prev.selectedSections, sectionId],
            };
        });
    };

    const toggleGroup = (groupId) => {
        setFormData((prev) => {
            const has = prev.selectedGroups.includes(groupId);
            return {
                ...prev,
                selectedGroups: has
                    ? prev.selectedGroups.filter((id) => id !== groupId)
                    : [...prev.selectedGroups, groupId],
            };
        });
    };

    // -----------------------------------------------------------------
    // Open / close modal
    // -----------------------------------------------------------------

    const handleOpenCreateModal = () => {
        setEditingTest(null);
        setFormData(emptyFormData);
        setExpandedFormClasses(new Set());
        setIsModalOpen(true);
    };

    const handleOpenEditModal = async (testItem) => {
        setEditingTest(testItem);

        const assignedClassIds = (testItem.classes_detail || []).map((c) => Number(c.id));
        const hasAllClasses = classes.length > 0 &&
            assignedClassIds.length === classes.length &&
            classes.every((cls) => assignedClassIds.includes(Number(cls.id)));

        const mode = hasAllClasses
            ? MODE_ALL
            : (assignedClassIds.length > 1 ? MODE_MULTIPLE : MODE_SINGLE);

        const selectedSections = (testItem.sections_detail || []).map((s) => s.id);
        const selectedGroups = (testItem.groups_detail || []).map((g) => g.id);

        setFormData({
            name: testItem.name || '',
            mode,
            selectedClassIds: assignedClassIds,
            selectedSections,
            selectedGroups,
            date: testItem.date || '',
            description: testItem.description || '',
        });

        // Pre-load section/group options for every class already assigned
        // (ensureClassOptions is a no-op for classes already cached)
        await Promise.all(assignedClassIds.map((id) => ensureClassOptions(id)));
        setExpandedFormClasses(new Set(assignedClassIds));

        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingTest(null);
        setFormData(emptyFormData);
        setExpandedFormClasses(new Set());
    };

    // -----------------------------------------------------------------
    // Save (create or update)
    // -----------------------------------------------------------------

    const handleSave = async (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            showMessage('error', 'Test name is required.');
            return;
        }

        if (formData.selectedClassIds.length === 0) {
            showMessage('error', 'Select at least one class to assign this test to.');
            return;
        }

        if (!formData.date) {
            showMessage('error', 'Test date is required.');
            return;
        }

        const payload = {
            name: formData.name.trim(),
            classes: formData.selectedClassIds.map((id) => Number(id)),
            sections: formData.selectedSections,
            groups: formData.selectedGroups,
            date: formData.date,
            description: formData.description,
        };

        setActionLoading(true);
        try {
            if (editingTest) {
                await api.put(`/tests/${editingTest.id}/`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                showMessage('success', 'Test updated successfully!');
            } else {
                await api.post('/tests/', payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                showMessage('success', 'Test scheduled successfully!');
            }
            handleCloseModal();
            fetchTests();
        } catch (err) {
            console.error('Error saving test:', err);
            showMessage('error', formatApiError(err.response?.data));
        } finally {
            setActionLoading(false);
        }
    };

    // Delete (DELETE)
    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this test?')) return;

        setActionLoading(true);
        try {
            await api.delete(`/tests/${id}/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            showMessage('success', 'Test deleted successfully!');
            fetchTests();
        } catch (err) {
            console.error('Error deleting test:', err);
            showMessage('error', 'Failed to delete test.');
        } finally {
            setActionLoading(false);
        }
    };

    // Reset Filters
    const handleResetFilters = () => {
        setSearchTerm('');
        setSelectedBoard('');
        setSelectedClassFilter('');
        setSelectedSectionFilter('');
        setSelectedGroupFilter('');
        setSelectedDateFilter('');
        setSelectedMonthFilter('');
    };

    // -----------------------------------------------------------------
    // Small render helpers
    // -----------------------------------------------------------------

    // Sections/groups panel for one class inside the modal. Checking a box
    // adds that id into the Test's single flat sections/groups list.
    const renderClassOptionsPanel = (classId) => {
        const opts = classOptions[classId];

        if (!opts || opts.loading) {
            return <span className="text-xs text-gray-400 p-2 block">Loading sections & groups...</span>;
        }

        return (
            <div className="space-y-3 pt-2">
                <div>
                    <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1 block">
                        Sections (optional — leave empty for ALL)
                    </label>
                    {opts.sections.length > 0 ? (
                        <div className="flex flex-wrap gap-2 border border-gray-200 rounded-lg p-2 max-h-28 overflow-y-auto bg-white">
                            {opts.sections.map((sec) => {
                                const checked = formData.selectedSections.includes(sec.id);
                                return (
                                    <label
                                        key={sec.id}
                                        className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                                            checked
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleSection(sec.id)}
                                            className="rounded accent-[var(--primary)] cursor-pointer"
                                        />
                                        <span>{sec.name}</span>
                                    </label>
                                );
                            })}
                        </div>
                    ) : (
                        <span className="text-xs text-gray-400 italic">No sections registered for this class.</span>
                    )}
                </div>

                <div>
                    <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1 block">
                        Groups (optional — leave empty for ALL)
                    </label>
                    {opts.groups.length > 0 ? (
                        <div className="flex flex-wrap gap-2 border border-gray-200 rounded-lg p-2 max-h-28 overflow-y-auto bg-white">
                            {opts.groups.map((grp) => {
                                const checked = formData.selectedGroups.includes(grp.id);
                                return (
                                    <label
                                        key={grp.id}
                                        className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                                            checked
                                                ? 'bg-purple-50 border-purple-200 text-purple-700 font-medium'
                                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleGroup(grp.id)}
                                            className="rounded accent-[var(--primary)] cursor-pointer"
                                        />
                                        <span>{grp.name}</span>
                                    </label>
                                );
                            })}
                        </div>
                    ) : (
                        <span className="text-xs text-gray-400 italic">No groups registered for this class.</span>
                    )}
                </div>
            </div>
        );
    };

    const renderClassChecklistRow = (cls, { checkable }) => {
        const classId = cls.id;
        const isSelected = getFormClassIds().includes(Number(classId));
        const isExpanded = expandedFormClasses.has(Number(classId));

        return (
            <div
                key={classId}
                className={`border rounded-xl overflow-hidden transition-colors ${
                    isSelected ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'
                }`}
            >
                <div className="flex items-center justify-between p-2.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer flex-1">
                        {checkable ? (
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleMultipleClass(classId)}
                                className="rounded accent-[var(--primary)] cursor-pointer"
                            />
                        ) : (
                            <span className="w-3.5 h-3.5 rounded-full bg-[var(--primary)] inline-block" />
                        )}
                        <span className={isSelected ? 'font-medium text-[var(--quinary)]' : 'text-gray-600'}>
                            {cls.display_name || cls.name}
                        </span>
                    </label>

                    {isSelected && (
                        <button
                            type="button"
                            onClick={() => toggleFormClassExpand(Number(classId))}
                            className="text-xs text-[var(--primary)] font-medium px-2 py-1 rounded-lg hover:bg-blue-100 cursor-pointer"
                        >
                            {isExpanded ? 'Hide sections/groups ▲' : 'Sections / Groups ▾'}
                        </button>
                    )}
                </div>

                {isSelected && isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-100 bg-white/60">
                        {renderClassOptionsPanel(classId)}
                    </div>
                )}
            </div>
        );
    };

    // Does the current combined sections/groups selection risk leaving any
    // selected class with zero eligible students? (see services.py —
    // sections/groups filter globally, not per class.)
    const riskyClassNames = (() => {
        if (formData.selectedSections.length === 0 && formData.selectedGroups.length === 0) return [];
        if (formData.selectedClassIds.length <= 1) return [];

        const risky = [];
        formData.selectedClassIds.forEach((classId) => {
            const opts = classOptions[classId];
            if (!opts || !opts.loaded) return;

            const classSectionIds = new Set(opts.sections.map((s) => s.id));
            const classGroupIds = new Set(opts.groups.map((g) => g.id));

            const sectionsRestricted = formData.selectedSections.length > 0;
            const groupsRestricted = formData.selectedGroups.length > 0;

            const hasMatchingSection = !sectionsRestricted ||
                formData.selectedSections.some((id) => classSectionIds.has(id));
            const hasMatchingGroup = !groupsRestricted ||
                formData.selectedGroups.some((id) => classGroupIds.has(id));

            if (!hasMatchingSection || !hasMatchingGroup) {
                const cls = classes.find((c) => Number(c.id) === Number(classId));
                if (cls) risky.push(cls.display_name || cls.name);
            }
        });
        return risky;
    })();

    // -----------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[var(--quinary)]">Tests Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Schedule, search, filter, and manage student tests.</p>
                </div>
                <button
                    onClick={handleOpenCreateModal}
                    className="bg-[var(--primary)] hover:bg-[var(--quinary)] text-white font-medium py-3 px-5 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer self-start md:self-auto"
                >
                    + Schedule New Test
                </button>
            </div>

            {/* Status Message Notification */}
            {message.text && (
                <div
                    className={`p-3 rounded-xl text-sm mb-6 border transition-all ${
                        message.type === 'success'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                >
                    {message.text}
                </div>
            )}

            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                    {/* Search Input */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Search Test
                        </label>
                        <input
                            type="text"
                            placeholder="Search by name or description..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)]"
                        />
                    </div>

                    {/* Board Filter */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Board
                        </label>
                        <select
                            value={selectedBoard}
                            onChange={(e) => setSelectedBoard(e.target.value)}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                        >
                            <option value="">All Boards</option>
                            <option value="Matric">Matric</option>
                            <option value="Cambridge">Cambridge</option>
                        </select>
                    </div>

                    {/* Class Filter (Backend-powered via class_id) */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Class
                        </label>
                        <select
                            value={selectedClassFilter}
                            onChange={(e) => setSelectedClassFilter(e.target.value)}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                        >
                            <option value="">All Classes</option>
                            {classes.map((cls) => (
                                <option key={cls.id} value={cls.id}>
                                    {cls.display_name || cls.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Section Filter */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Section
                        </label>
                        <select
                            value={selectedSectionFilter}
                            onChange={(e) => setSelectedSectionFilter(e.target.value)}
                            disabled={!selectedClassFilter}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <option value="">All Sections</option>
                            {sections.map((sec) => (
                                <option key={sec.id} value={sec.id}>{sec.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Group Filter */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Group
                        </label>
                        <select
                            value={selectedGroupFilter}
                            onChange={(e) => setSelectedGroupFilter(e.target.value)}
                            disabled={!selectedClassFilter}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <option value="">All Groups</option>
                            {groups.map((grp) => (
                                <option key={grp.id} value={grp.id}>{grp.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Exact Date Filter */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Date
                        </label>
                        <input
                            type="date"
                            value={selectedDateFilter}
                            onChange={(e) => setSelectedDateFilter(e.target.value)}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                        />
                    </div>

                    {/* Month Filter */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Month
                        </label>
                        <select
                            value={selectedMonthFilter}
                            onChange={(e) => setSelectedMonthFilter(e.target.value)}
                            className="w-full bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-2.5 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                        >
                            <option value="">All Months</option>
                            {MONTH_OPTIONS.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex justify-end mt-3">
                    <button
                        onClick={handleResetFilters}
                        className="text-xs text-gray-500 hover:text-[var(--primary)] underline font-medium cursor-pointer"
                    >
                        Reset Filters
                    </button>
                </div>
            </div>

            {/* Tests Data Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                <th className="p-4 w-10"></th>
                                <th className="p-4">#</th>
                                <th className="p-4">Test Name</th>
                                <th className="p-4">Class</th>
                                <th className="p-4">Sections</th>
                                <th className="p-4">Groups</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Description</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="9" className="p-6 text-center text-gray-400">
                                        Loading tests...
                                    </td>
                                </tr>
                            ) : tests.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="p-6 text-center text-gray-400">
                                        No tests found matching the criteria.
                                    </td>
                                </tr>
                            ) : (
                                tests.map((t, idx) => {
                                    // Backend already computes the right label here:
                                    // "All Classes" when every class is assigned,
                                    // "No Classes" when none are, the class names
                                    // when there are a few, or "X, Y, Z + N more"
                                    // when there are many.
                                    const assignedClasses = t.classes_display || 'N/A';
                                    const isExpanded = expandedTests.has(t.id);
                                    const testSectionIds = (t.sections_detail || []).map((s) => s.id);
                                    const testGroupIds = (t.groups_detail || []).map((g) => g.id);
                                    const isGloballyAllSections = testSectionIds.length === 0;
                                    const isGloballyAllGroups = testGroupIds.length === 0;
                                    const classCount = (t.classes_detail || []).length;

                                    return (
                                        <React.Fragment key={t.id}>
                                            <tr className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4">
                                                    {classCount > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleTestExpand(t)}
                                                            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-[var(--primary)] cursor-pointer"
                                                            title="Show per-class breakdown"
                                                        >
                                                            {isExpanded ? '▾' : '▸'}
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="p-4 text-gray-400 font-medium">{idx + 1}</td>
                                                <td className="p-4 font-semibold text-[var(--quinary)]">{t.name}</td>
                                                <td className="p-4 font-medium text-gray-700">{assignedClasses}</td>
                                                {/* Sections Column */}
                                                <td className="p-3 whitespace-nowrap">
                                                    {t.sections_detail && t.sections_detail.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {t.sections_detail.map((sec) => (
                                                                <span key={sec.id} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-md border border-blue-100 font-medium">
                                                                    {sec.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs italic">All Sections</span>
                                                    )}
                                                </td>

                                                {/* Groups Column */}
                                                <td className="p-3 whitespace-nowrap">
                                                    {t.groups_detail && t.groups_detail.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {t.groups_detail.map((grp) => (
                                                                <span key={grp.id} className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded-md border border-purple-100 font-medium">
                                                                    {grp.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs italic">All Groups</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-gray-600 font-medium">{t.date}</td>
                                                <td className="p-4 text-gray-500 max-w-xs truncate">
                                                    {t.description ? (
                                                        t.description
                                                    ) : (
                                                        <span className="text-gray-300 italic">No description</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-right space-x-2">
                                                    <button
                                                        onClick={() => handleOpenEditModal(t)}
                                                        className="px-3 py-1.5 text-xs font-medium text-[var(--primary)] bg-gray-100 hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors cursor-pointer"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(t.id)}
                                                        disabled={actionLoading}
                                                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>

                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan="9" className="p-0 bg-gray-50/70">
                                                        <div className="p-4 pl-14 space-y-2">
                                                            {(t.classes_detail || []).map((cls) => {
                                                                const opts = classOptions[cls.id];
                                                                const loaded = opts && opts.loaded;

                                                                const sectionsForClass = loaded
                                                                    ? opts.sections.filter((s) => testSectionIds.includes(s.id))
                                                                    : [];
                                                                const groupsForClass = loaded
                                                                    ? opts.groups.filter((g) => testGroupIds.includes(g.id))
                                                                    : [];

                                                                const noSectionMatch = loaded && !isGloballyAllSections && sectionsForClass.length === 0;
                                                                const noGroupMatch = loaded && !isGloballyAllGroups && groupsForClass.length === 0;

                                                                return (
                                                                    <div
                                                                        key={cls.id}
                                                                        className="flex flex-col gap-2 bg-white border border-gray-200 rounded-xl p-3"
                                                                    >
                                                                        <div className="text-sm font-medium text-[var(--quinary)]">
                                                                            {cls.display_name || cls.name}
                                                                        </div>

                                                                        {!loaded ? (
                                                                            <span className="text-xs text-gray-400 italic">Loading...</span>
                                                                        ) : (
                                                                            <div className="flex flex-wrap gap-4">
                                                                                <div className="flex flex-wrap gap-1 items-center">
                                                                                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-1">
                                                                                        Sections:
                                                                                    </span>
                                                                                    {isGloballyAllSections ? (
                                                                                        <span className="text-gray-400 text-xs italic">All Sections</span>
                                                                                    ) : noSectionMatch ? (
                                                                                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 font-medium">
                                                                                            No matching sections — 0 eligible
                                                                                        </span>
                                                                                    ) : (
                                                                                        sectionsForClass.map((s) => (
                                                                                            <span key={s.id} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-md border border-blue-100 font-medium">
                                                                                                {s.name}
                                                                                            </span>
                                                                                        ))
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-1 items-center">
                                                                                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-1">
                                                                                        Groups:
                                                                                    </span>
                                                                                    {isGloballyAllGroups ? (
                                                                                        <span className="text-gray-400 text-xs italic">All Groups</span>
                                                                                    ) : noGroupMatch ? (
                                                                                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 font-medium">
                                                                                            No matching groups — 0 eligible
                                                                                        </span>
                                                                                    ) : (
                                                                                        groupsForClass.map((g) => (
                                                                                            <span key={g.id} className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded-md border border-purple-100 font-medium">
                                                                                                {g.name}
                                                                                            </span>
                                                                                        ))
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Schedule / Edit Test */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-[var(--quinary)]">
                                {editingTest ? 'Edit Test' : 'Schedule New Test'}
                            </h2>
                            <button
                                onClick={handleCloseModal}
                                className="text-gray-400 hover:text-gray-600 text-sm font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            {/* Test Name Input */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Test Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Midterm Examination"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="bg-white border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-[var(--primary)]"
                                />
                            </div>

                            {/* Assignment Mode */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Assign To
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: MODE_SINGLE, label: 'Single Class' },
                                        { value: MODE_MULTIPLE, label: 'Multiple Classes' },
                                        { value: MODE_ALL, label: 'All Classes' },
                                    ].map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => handleModeChange(opt.value)}
                                            className={`text-xs font-medium py-2.5 rounded-xl border transition-colors cursor-pointer ${
                                                formData.mode === opt.value
                                                    ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Single Class Mode */}
                            {formData.mode === MODE_SINGLE && (
                                <div className="space-y-3">
                                    <div className="flex flex-col">
                                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                            Select Class
                                        </label>
                                        <select
                                            required
                                            value={formData.selectedClassIds[0] || ''}
                                            onChange={(e) => handleSingleClassSelect(e.target.value)}
                                            className="bg-white border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                                        >
                                            <option value="">Select Class</option>
                                            {classes.map((cls) => (
                                                <option key={cls.id} value={cls.id}>
                                                    {cls.display_name || cls.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {formData.selectedClassIds[0] && (
                                        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/60">
                                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                Sections & Groups for this class
                                            </span>
                                            {renderClassOptionsPanel(formData.selectedClassIds[0])}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Multiple Classes Mode */}
                            {formData.mode === MODE_MULTIPLE && (
                                <div className="flex flex-col">
                                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                        Select Classes (check the ones to assign)
                                    </label>
                                    <div className="space-y-2 max-h-72 overflow-y-auto p-1">
                                        {classes.length > 0 ? (
                                            classes.map((cls) => renderClassChecklistRow(cls, { checkable: true }))
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">No classes available.</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* All Classes Mode */}
                            {formData.mode === MODE_ALL && (
                                <div className="flex flex-col">
                                    <div className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-2">
                                        This test will be assigned to <strong>all {classes.length} classes</strong>.
                                        You can still optionally restrict individual classes to specific sections or groups below.
                                    </div>
                                    <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                        Classes ({classes.length})
                                    </label>
                                    <div className="space-y-2 max-h-72 overflow-y-auto p-1">
                                        {classes.length > 0 ? (
                                            classes.map((cls) => renderClassChecklistRow(cls, { checkable: false }))
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">No classes available.</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Global-scope warning: sections/groups apply across ALL
                                selected classes at once (see services.py), so a class
                                whose students don't match any checked section/group
                                would end up with zero eligible students. */}
                            {formData.mode !== MODE_SINGLE && riskyClassNames.length > 0 && (
                                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                    <strong>Heads up:</strong> sections and groups apply across every selected class at
                                    once — they aren't scoped per class. Based on your current picks,{' '}
                                    <strong>{riskyClassNames.join(', ')}</strong>{' '}
                                    {riskyClassNames.length === 1 ? 'has' : 'have'} no matching section/group selected
                                    and would end up with <strong>zero eligible students</strong>. Either check at least
                                    one section/group that belongs to {riskyClassNames.length === 1 ? 'that class' : 'those classes'},
                                    or leave sections/groups empty to include everyone.
                                </div>
                            )}

                            {/* Date Picker */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Test Date *
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="bg-white border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-[var(--primary)] cursor-pointer"
                                />
                            </div>

                            {/* Optional Description Textarea */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Description <span className="text-gray-400 font-normal">(Optional)</span>
                                </label>
                                <textarea
                                    rows="3"
                                    placeholder="Add optional notes, syllabus coverage, or remarks..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="bg-white border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-[var(--primary)] resize-none"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors font-medium cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="px-5 py-2 text-sm text-white bg-[var(--primary)] hover:bg-[var(--quinary)] rounded-xl transition-colors font-medium shadow-md disabled:opacity-50 cursor-pointer"
                                >
                                    {actionLoading ? 'Saving...' : editingTest ? 'Update Test' : 'Schedule Test'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tests;