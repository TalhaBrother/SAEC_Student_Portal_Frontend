import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

const Tests = () => {
    const token = useAuthStore((state) => state.accessToken);

    // Data States
    const [tests, setTests] = useState([]);
    const [classes, setClasses] = useState([]);

    // Search & Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClassFilter, setSelectedClassFilter] = useState('');

    // Modal & Form States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTest, setEditingTest] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        student_class: '',
        date: '',
        description: ''
    });

    // UI & Loading States
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Toast Notification helper
    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 4000);
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

    // 2. Fetch Tests list with backend `class_id` filtering logic
    const fetchTests = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedClassFilter) {
                params.append('class_id', selectedClassFilter);
            }

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
    }, [token, selectedClassFilter]);

    useEffect(() => {
        if (token) fetchTests();
    }, [fetchTests, token]);

    // 3. Client-side Search Filtering across Test Name & Description
    const filteredTests = tests.filter((test) => {
        const query = searchTerm.toLowerCase().trim();
        if (!query) return true;

        const matchesName = test.name ? test.name.toLowerCase().includes(query) : false;
        const matchesDesc = test.description ? test.description.toLowerCase().includes(query) : false;

        return matchesName || matchesDesc;
    });

    // Modal Handlers
    const handleOpenModal = (testItem = null) => {
        if (testItem) {
            setEditingTest(testItem);
            
            // Handle extract class ID from classes_detail array returned by TestSerializer
            const extractedClassId = testItem.classes_detail && testItem.classes_detail.length > 0 
                ? testItem.classes_detail[0].id 
                : (testItem.classes ? testItem.classes[0] : '');

            setFormData({
                name: testItem.name || '',
                student_class: extractedClassId,
                date: testItem.date || '',
                description: testItem.description || ''
            });
        } else {
            setEditingTest(null);
            setFormData({
                name: '',
                student_class: '',
                date: '',
                description: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingTest(null);
        setFormData({ name: '', student_class: '', date: '', description: '' });
    };

    // Create & Update (POST / PUT)
    const handleSave = async (e) => {
        e.preventDefault();
        setActionLoading(true);

        // Django expects ManyToMany array for classes: [class_id]
        const payload = {
            name: formData.name,
            classes: [Number(formData.student_class)],
            date: formData.date,
        };

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
            const errorData = err.response?.data;
            if (errorData && typeof errorData === 'object') {
                const firstKey = Object.keys(errorData)[0];
                const msg = Array.isArray(errorData[firstKey]) ? errorData[firstKey][0] : errorData[firstKey];
                showMessage('error', `${firstKey.toUpperCase()}: ${msg}`);
            } else {
                showMessage('error', 'Failed to save test. Please check your inputs.');
            }
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
        setSelectedClassFilter('');
    };

    return (
        <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[var(--quinary)]">Tests Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Schedule, search, filter, and manage student tests.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

                    {/* Class Filter (Backend-powered via class_id) */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                            Filter by Class
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
                                <th className="p-4">#</th>
                                <th className="p-4">Test Name</th>
                                <th className="p-4">Class</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Description</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="p-6 text-center text-gray-400">
                                        Loading tests...
                                    </td>
                                </tr>
                            ) : filteredTests.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="p-6 text-center text-gray-400">
                                        No tests found.
                                    </td>
                                </tr>
                            ) : (
                                filteredTests.map((t, idx) => {
                                    // Parse class name from backend `classes_detail` array
                                    const assignedClasses = t.classes_detail && t.classes_detail.length > 0
                                        ? t.classes_detail.map(c => c.name).join(', ')
                                        : 'N/A';

                                    return (
                                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4 text-gray-400 font-medium">{idx + 1}</td>
                                            <td className="p-4 font-semibold text-[var(--quinary)]">{t.name}</td>
                                            <td className="p-4 font-medium text-gray-700">{assignedClasses}</td>
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
                                                    onClick={() => handleOpenModal(t)}
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
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Schedule / Edit Test */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full p-6">
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

                            {/* Class Selector */}
                            <div className="flex flex-col">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Assign to Class *
                                </label>
                                <select
                                    required
                                    value={formData.student_class}
                                    onChange={(e) => setFormData({ ...formData, student_class: e.target.value })}
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