// src/components/auth/AuthScreen.jsx
import React, { useState } from 'react';
import { supabase, isMockMode } from '../../supabaseClient';
import { GraduationCap, Calendar } from '../ui/Icons';

export default function AuthScreen({ onAuthSuccess }) {
  const [activeTab, setActiveTab] = useState('signin'); // 'signin' | 'signup'
  const [role, setRole] = useState('student'); // 'student' | 'organizer'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration metadata
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [branch, setBranch] = useState('');
  const [semester, setSemester] = useState('');
  const [institutionType, setInstitutionType] = useState('UVCE');
  const [customCollege, setCustomCollege] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (activeTab === 'signin') {
      // SIGN IN
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) throw authError;

        // Force the application to wait for the database profile check before changing dashboard views
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single();

        let userRole = authData.user.user_metadata?.role || 'student';
        if (!profileError && profileData?.role) {
          userRole = profileData.role;
        }

        onAuthSuccess(authData.user, userRole);
      } catch (err) {
        setErrorMsg(err.message || 'Authentication failed');
        setLoading(false);
      }
    } else {
      // SIGN UP
      if (!fullName || !phone) {
        setErrorMsg('Please fill in Name and Phone Number.');
        setLoading(false);
        return;
      }
      if (role === 'student') {
        if (!username) {
          setErrorMsg('Please choose a username.');
          setLoading(false);
          return;
        }
        if (!/^[a-z0-9_]+$/.test(username)) {
          setErrorMsg('Username can only contain lowercase letters, numbers, and underscores.');
          setLoading(false);
          return;
        }
        if (institutionType === 'OTHER' && !customCollege.trim()) {
          setErrorMsg('Please specify your college name.');
          setLoading(false);
          return;
        }
        if (!rollNumber || !branch || !semester) {
          setErrorMsg('Please fill in Roll Number, Branch, and Semester.');
          setLoading(false);
          return;
        }

        // Clean and normalize the roll number string input
        const formattedRollNumber = rollNumber.trim().toUpperCase();

        // Unique Roll Number Guardrail query
        const { data: existingStudent, error: checkError } = await supabase
          .from('profiles')
          .select('roll_number')
          .eq('roll_number', formattedRollNumber)
          .maybeSingle();

        if (checkError) {
          console.error("Validation query error:", checkError.message);
        }

        if (existingStudent) {
          setErrorMsg(`The Roll Number "${formattedRollNumber}" has already been registered.`);
          setLoading(false);
          return;
        }
      }

      const finalCollegeName = institutionType === 'UVCE' ? 'UVCE' : customCollege.trim();

      const signUpData = {
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone,
            role,
            ...(role === 'student'
              ? { roll_number: rollNumber.trim().toUpperCase(), branch, semester, username: username.toLowerCase().trim(), college_name: finalCollegeName }
              : { branch }), // For organizers, branch represents their department
          },
        },
      };

      const { data, error } = await supabase.auth.signUp(signUpData);

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
      } else {
        if (isMockMode) {
          // In mock mode, sign up automatically logs the user in
          onAuthSuccess(data.user, role);
        } else {
          setSuccessMsg('Registration successful! Please check your email for verification.');
          setLoading(false);
          // Wait 3 seconds then flip to signin
          setTimeout(() => {
            setActiveTab('signin');
            setErrorMsg('');
            setSuccessMsg('');
          }, 3000);
        }
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 font-sans">
      {/* Left Pane - Branding Info */}
      <div className="w-full md:w-1/2 bg-slate-100 flex flex-col justify-center px-8 py-16 md:px-16 lg:px-24">
        <div className="max-w-md mx-auto">
          {/* Logo & Headline */}
          <h1 className="text-4xl lg:text-5xl font-black text-primary-500 tracking-tight mb-4">
            UVCEvents
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed mb-12">
            The centralized hub for academic excellence, workshops, and student networking.
          </p>

          {/* Cards */}
          <div className="space-y-6">
            {/* Card 1 - Students */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start gap-4 transition-all duration-300 hover:shadow-md">
              <div className="p-3 bg-primary-50 text-primary-500 rounded-xl">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-base mb-1">For Students</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Access exclusive workshops and build your academic portfolio.
                </p>
              </div>
            </div>

            {/* Card 2 - Organizers */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start gap-4 transition-all duration-300 hover:shadow-md">
              <div className="p-3 bg-indigo-50 text-indigo-500 rounded-xl">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-base mb-1">For Organizers</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Manage club events and track student engagement seamlessly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Pane - Form Details */}
      <div className="w-full md:w-1/2 bg-white flex flex-col justify-center px-8 py-16 md:px-16 lg:px-24 border-t md:border-t-0 md:border-l border-slate-100">
        <div className="max-w-md w-full mx-auto">
          {/* Role Switcher Pills */}
          <div className="bg-slate-100/80 p-1.5 rounded-xl flex gap-1 mb-8">
            <button
              type="button"
              onClick={() => { setRole('student'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all ${
                role === 'student' ? 'bg-white text-primary-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Student
            </button>
            <button
              type="button"
              onClick={() => { setRole('organizer'); setActiveTab('signin'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all ${
                role === 'organizer' ? 'bg-white text-primary-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Event Organizer
            </button>
          </div>

          {/* Tab Selection - Only show if student role is selected */}
          {role === 'student' && (
            <div className="flex border-b border-slate-200 mb-8 relative">
              <button
                type="button"
                onClick={() => { setActiveTab('signin'); setErrorMsg(''); setSuccessMsg(''); }}
                className={`flex-1 pb-4 text-center font-semibold text-sm transition-colors ${
                  activeTab === 'signin' ? 'text-primary-500 border-b-2 border-primary-500' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('signup'); setErrorMsg(''); setSuccessMsg(''); }}
                className={`flex-1 pb-4 text-center font-semibold text-sm transition-colors ${
                  activeTab === 'signup' ? 'text-primary-500 border-b-2 border-primary-500' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Welcome Text */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === 'signin' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {activeTab === 'signin'
                ? 'Enter your credentials to access your academic portal.'
                : 'Join the academic portal to explore and create events.'}
            </p>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="mb-6 p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-sm font-medium">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-sm font-medium">
              {successMsg}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-5">
            {activeTab === 'signup' && (
              <>
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Phone Number (without +91)</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm"
                  />
                </div>

                {/* Username */}
                {role === 'student' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Choose Username</label>
                    <input
                      type="text"
                      required
                      pattern="^[a-z0-9_]+$"
                      title="Username can only contain lowercase letters, numbers, and underscores"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm animate-fade-in"
                    />
                  </div>
                )}

                {/* Student specific fields */}
                {role === 'student' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Roll Number</label>
                      <input
                        type="text"
                        required
                        value={rollNumber}
                        onChange={(e) => setRollNumber(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Branch</label>
                      <select
                        required
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm bg-white cursor-pointer"
                      >
                        <option value="">Select Branch</option>
                        <option value="Computer Science Engineering">Computer Science & Engineering (CSE)</option>
                        <option value="Information Science Engineering">Information Science & Engineering (ISE)</option>       
                        <option value="Artificial Intelligence & Machine Learning">Artificial Intelligence & ML (AI&ML)</option>
                        <option value="Artificial Intelligence & Data Science">Artificial Intelligence & Data Science (AIDS)</option>
                        <option value="Electronics & Communication Engineering">Electronics & Communication (ECE)</option>
                        <option value="Electrical & Electronics Engineering">Electrical & Electronics (EEE)</option>
                        <option value="Mechanical Engineering">Mechanical Engineering (ME)</option>
                        <option value="Civil Engineering">Civil Engineering (CE)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Semester</label>
                      <select
                        required
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm bg-white"
                      >
                        <option value="">Select</option>
                        <option value="1st Semester">1st Sem</option>
                        <option value="2nd Semester">2nd Sem</option>
                        <option value="3rd Semester">3rd Sem</option>
                        <option value="4th Semester">4th Sem</option>
                        <option value="5th Semester">5th Sem</option>
                        <option value="6th Semester">6th Sem</option>
                        <option value="7th Semester">7th Sem</option>
                        <option value="8th Semester">8th Sem</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  // Organizer branch/department
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Department / Club Name</label>
                    <input
                      type="text"
                      required
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm"
                    />
                  </div>
                )}
              </>
            )}

            {/* Institution / College selector */}
            {activeTab === 'signup' && role === 'student' && (
              <>
                {/* INSTITUTION TYPE DROP-DOWN SELECTOR */}
                <div className="flex flex-col gap-1.5 w-full mt-4">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Institution / College
                  </label>
                  <select 
                    value={institutionType}
                    onChange={(e) => {
                      setInstitutionType(e.target.value);
                      if (e.target.value === 'UVCE') setCustomCollege(''); // Clear text if switching back
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm bg-white cursor-pointer"
                  >
                    <option value="UVCE">University Visvesvaraya College of Engineering (UVCE)</option>
                    <option value="OTHER">Other Institute...</option>
                  </select>
                </div>

                {/* DYNAMIC TEXT FIELD INPUT FOR EXTERNAL COLLEGES */}
                {institutionType === 'OTHER' && (
                  <div className="flex flex-col gap-1.5 w-full mt-3 animate-fade-in">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Specify College Name
                    </label>
                    <input
                      type="text"
                      required
                      value={customCollege}
                      onChange={(e) => setCustomCollege(e.target.value)}
                      placeholder="e.g., MSRIT, BMSCE, RVCE..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm bg-white"
                    />
                  </div>
                )}
              </>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Password</label>
                {activeTab === 'signin' && (
                  <a href="#" className="text-xs text-primary-500 font-semibold hover:underline">
                    Forgot Password?
                  </a>
                )}
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-500 hover:bg-primary-600 disabled:bg-primary-400 text-white font-semibold py-3 px-4 rounded-xl shadow-md shadow-primary-500/10 hover:shadow-lg hover:shadow-primary-500/20 transition-all flex items-center justify-center gap-2 text-sm mt-2"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : activeTab === 'signin' ? (
                'Sign In to Dashboard'
              ) : (
                `Register as ${role === 'student' ? 'Student' : 'Organizer'}`
              )}
            </button>
          </form>

          {/* Social login buttons - Only for Sign In screens */}
          {activeTab === 'signin' && (
            <>
              {/* Divider */}
              <div className="relative my-8 flex items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-[10px] font-bold text-gray-400 tracking-widest uppercase">
                  OR CONTINUE WITH
                </span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {/* Social login buttons */}
              <div>
                <button 
                  type="button"
                  onClick={() => alert('SSO login is only supported in live mode')} 
                  className="w-full flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-3 px-4 text-xs font-semibold text-gray-600 hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                    <g transform="matrix(1, 0, 0, 1, 0, 0)">
                      <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.4C21.68,11.83 21.56,11.43 21.35,11.1z" fill="#4285F4" />
                      <path d="M12,21c2.43,0 4.47,-0.8 5.96,-2.18l-2.88,-2.23c-0.8,0.53 -1.82,0.85 -3.08,0.85 -2.37,0 -4.38,-1.6 -5.1,-3.75H3.9v2.3C5.38,18.9 8.47,21 12,21z" fill="#34A853" />
                      <path d="M6.9,13.7c-0.18,-0.53 -0.28,-1.1 -0.28,-1.7c0,-0.6 0.1,-1.17 0.28,-1.7V8H3.9C3.3,9.2 3,10.6 3,12c0,1.4 0.3,2.8 0.9,4h3L6.9,13.7z" fill="#FBBC05" />
                      <path d="M12,6.75c1.32,0 2.5,0.45 3.44,1.35l2.58,-2.58C16.46,4.05 14.43,3 12,3 8.47,3 5.38,5.1 3.9,8l3,2.3c0.72,-2.15 2.73,-3.55 5.1,-3.55z" fill="#EA4335" />
                    </g>
                  </svg>
                  University SSO
                </button>
              </div>
            </>
          )}

          {/* Legal */}
          <p className="text-[10px] text-center text-gray-400 mt-8 leading-relaxed">
            By continuing, you agree to our <a href="#" className="hover:underline text-gray-500 font-semibold">Terms of Service</a> and <a href="#" className="hover:underline text-gray-500 font-semibold">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
