import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';

const Create_Test = () => {
    const token = useAuthStore((state) => state.accessToken);

    // Form States
    const [testName, setTestName] = useState("");
    const [selectedClass, setSelectedClass] = useState("");
    const [testDate, setTestDate] = useState("");
    
    // Classes list state
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    // Fetch classes list for dropdown
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const res = await api.get("/classes/", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setClasses(res.data);
            } catch (err) {
                console.error("Error fetching classes:", err);
            }
        };
        if (token) fetchClasses();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: "", text: "" });

        const testPayload = {
            name: testName,
            student_class: Number(selectedClass),
            date: testDate
        };

        try {
            const res = await api.post("/tests/", testPayload, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            console.log("Test Created Successfully:", res.data);
            setMessage({ type: "success", text: "Test created successfully!" });
            
            setTestName("");
            setSelectedClass("");
            setTestDate("");
        } catch (error) {
            console.error("Error creating test:", error);
            setMessage({ type: "error", text: "Failed to create test. Please try again." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col md:flex-row-reverse bg-[var(--secondary)] text-[var(--quinary)] font-sans">
            
{/*            
            <div className="hidden md:flex md:w-1/2 bg-[var(--primary)] p-12 flex-col justify-between items-center relative overflow-hidden select-none">
              
                <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-[var(--tertiary)] rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-[var(--quaternary)] rounded-full filter blur-3xl opacity-20"></div>

             
                <div className="w-full text-left z-10 mt-10 text-white">
                    <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-2">
                        Manage <br /> Assessments
                    </h1>
                    <p className="text-blue-100 text-sm opacity-90">Create and schedule new tests for your classes efficiently</p>
                </div>

            
                <div className="w-full max-w-md aspect-square flex items-center justify-center z-10 relative mb-10">
                    <div className="w-full h-full border-2 border-dashed border-blue-300/30 rounded-2xl flex flex-col items-center justify-center p-6 bg-white/5 backdrop-blur-sm">
                        <span className="text-blue-100 text-sm text-center">
                            [ Place Test Schedule Illustration Here ]
                        </span>
                    </div>
                </div>
            </div>  */}

            {/* Left Side: Form Side */}
            <div className="w-full  flex flex-col justify-center px-6 sm:px-16 lg:px-24 py-12">
                <div className="max-w-md w-full mx-auto">
                    
                    {/* Header */}
                    <div className="mb-8">
                        <h2 className="text-3xl font-semibold tracking-wide mb-2 text-[var(--quinary)]">Create New Test</h2>
                        <p className="text-gray-500 text-sm">Fill in the details to schedule an evaluation</p>
                    </div>

                    {/* Status Message Display */}
                    {message.text && (
                        <div className={`p-3 rounded-xl text-sm mb-4 text-center border ${
                            message.type === "success" 
                                ? "bg-green-50 text-green-700 border-green-200" 
                                : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                            {message.text}
                        </div>
                    )}

                    {/* Form matching your specific line styling layout */}
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        
                        {/* Test Name Input */}
                        <div className="relative border-b border-gray-300 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
                            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                Test Name
                            </label>
                            <input 
                                type="text"
                                value={testName}
                                onChange={(e) => setTestName(e.target.value)}
                                placeholder="e.g., Midterm Examination"
                                required
                                className="w-full bg-transparent border-none outline-none text-[var(--quinary)] placeholder-gray-400 text-sm py-1 focus:ring-0"
                            />
                        </div>

                        {/* Class Selector Dropdown */}
                        <div className="relative border-b border-gray-300 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
                            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                Assign to Class
                            </label>
                            <select
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                                required
                                className="w-full bg-transparent border-none outline-none text-[var(--quinary)] text-sm py-1 focus:ring-0 cursor-pointer"
                            >
                                <option value="" className="text-gray-400">Select Class</option>
                                {classes.map((cls) => (
                                    <option key={cls.id} value={cls.id} className="text-[var(--quinary)]">
                                        {cls.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date Picker Input */}
                        <div className="relative border-b border-gray-300 focus-within:border-[var(--primary)] transition-colors duration-300 py-1">
                            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                Test Date
                            </label>
                            <input 
                                type="date"
                                value={testDate}
                                onChange={(e) => setTestDate(e.target.value)}
                                required
                                className="w-full bg-transparent border-none outline-none text-[var(--quinary)] text-sm py-1 focus:ring-0 cursor-pointer"
                            />
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-blue-900/10 transform active:scale-[0.98] mt-4"
                        >
                            {loading ? "Scheduling..." : "Schedule Test"}
                        </button>
                    </form>

                </div>
            </div>

        </div>
    );
};

export default Create_Test;