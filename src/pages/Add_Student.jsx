// SAEC Student Portal

import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/authStore';
import Swal from "sweetalert2";

const Add_Student = () => {
  const [fullName, setFullName] = useState("");
  const [fatherName, setfatherName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [residence, setResidence] = useState("");
  const [studentWhatsappNo, setStudentWhatsappNo] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [Classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

  // Group-related state
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("");
  const [groupsLoading, setGroupsLoading] = useState(false);

  const token = useAuthStore((state) => state.accessToken);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        full_name: fullName,
        father_name: fatherName,
        student_id: studentId,
        student_class: studentClass,
        phone: phone,
        gender: gender,
        residence: residence,
        student_whatsapp_no: studentWhatsappNo,
        username: username,
        email: email,
        password: password
      };

      // Only include `group` when the selected class actually has groups.
      if (groups.length > 0 && groupId) {
        payload.group = groupId;
      }

      const res = await api.post(
        "/students/",
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log("Student Added Successfully!", res.data);
      Swal.fire({
        title: "Success!",
        text: "Student Profile Registered Successfully!",
        icon: "success",
        confirmButtonText: "OK",
        confirmButtonColor: "#0056D2", // --primary
        background: "#F4F7FC",         // --secondary
        color: "#1A253C",              // --quinary
      });

      // Reset state form fields
      setFullName("");
      setfatherName("");
      setStudentId("");
      setStudentClass("");
      setPhone("");
      setGender("");
      setResidence("");
      setStudentWhatsappNo("");
      setUsername("");
      setEmail("");
      setPassword("");
      setGroupId("");
      setGroups([]);
    } catch (error) {
      console.error("Add Student Error!");
      console.log("Status:", error.response?.status);
      console.log("Data:", error.response?.data);

      const errorData = error.response?.data;
      let errorMsg = "Failed to register student. Please check input field constraints.";
      if (errorData && typeof errorData === "object") {
        errorMsg = Object.entries(errorData)
          .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(" ") : val}`)
          .join("\n");
      }
      alert(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await api.get("/classes/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setClasses(res.data);
        console.log(res.data);
      } catch (err) {
        console.log(err);
      }
    };

    if (token) {
      fetchClasses();
    }
  }, [token]);

  // Fetch groups whenever the selected class changes.
  useEffect(() => {
    const fetchGroups = async () => {
      setGroupsLoading(true);
      try {
        const res = await api.get(`/groups/?class_id=${studentClass}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setGroups(res.data);
      } catch (err) {
        console.log(err);
        setGroups([]);
      } finally {
        setGroupsLoading(false);
      }
    };

    // Reset group selection whenever the class changes
    setGroupId("");

    if (token && studentClass) {
      fetchGroups();
    } else {
      setGroups([]);
    }
  }, [studentClass, token]);

  return (
    <div className="p-6 bg-[var(--secondary)] text-[var(--quinary)] min-h-screen font-sans">
      {/* View Header */}
      <div className="text-3xl font-bold tracking-tight mb-2 text-[var(--quinary)]">
        Register New Student
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Create an official student account record in the administrative directory system database.
      </p>

      {/* Main Form Box Container */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Section: Personal Profiles */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Shayan Khan"
                  required
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Father Name
                </label>
                <input
                  type="text"
                  value={fatherName}
                  onChange={(e) => setfatherName(e.target.value)}
                  placeholder="Shafat Khan"
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Residence Address
                </label>
                <input
                  type="text"
                  value={residence}
                  onChange={(e) => setResidence(e.target.value)}
                  placeholder="Block 13, Gulshan-e-Iqbal, Karachi"
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Parent WhatsApp No
                </label>
                <input
                  type="tel"
                  maxLength={11}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="03001234567"
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
                {phone.length > 0 && phone.length < 11 && (
                  <span className="text-xs text-red-500 mt-1 font-medium">
                    Phone number must be exactly 11 digits ({phone.length}/11)
                  </span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Student WhatsApp No
                </label>
                <input
                  type="tel"
                  maxLength={11}
                  value={studentWhatsappNo}
                  onChange={(e) => setStudentWhatsappNo(e.target.value)}
                  placeholder="03007654321"
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
                 {studentWhatsappNo.length > 0 && studentWhatsappNo.length < 11 && (
                  <span className="text-xs text-red-500 mt-1 font-medium">
                    Phone number must be exactly 11 digits ({studentWhatsappNo.length}/11)
                  </span>
                )}
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Section: Academic Assignments */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Academic Placement
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  GR No / Student ID
                </label>
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="STU-2026-001"
                  required
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Class / Grade Assigned
                </label>
                <select
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value)}
                  required
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                >
                  <option value="">Select Class</option>
                  {Classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.display_name}</option>
                  ))}
                </select>
              </div>

              {/* Group is conditional: only shown when the selected class has groups defined */}
              {studentClass && groupsLoading && (
                <div className="flex flex-col">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Group
                  </label>
                  <div className="text-sm text-gray-400 p-3">Loading groups...</div>
                </div>
              )}

              {studentClass && !groupsLoading && groups.length > 0 && (
                <div className="flex flex-col">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Group
                  </label>
                  <select
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    required
                    className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                  >
                    <option value="">Select Group</option>
                    {groups.map((grp) => (
                      <option key={grp.id} value={grp.id}>{grp.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Section: System Credentials */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Portal Account Credentials
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="shayankhan123"
                  required
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="shayan@gmail.com"
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  System Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm"
                />
              </div>
            </div>
          </div>

          {/* Form Submission Action Block */}
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-[var(--primary)] hover:bg-[var(--quinary)] disabled:opacity-50 text-white font-medium py-3 px-8 rounded-xl transition-all duration-300 shadow-md transform active:scale-[0.98] cursor-pointer text-sm font-semibold tracking-wide uppercase"
            >
              {loading ? "Registering Record..." : "Create Student Account"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default Add_Student;