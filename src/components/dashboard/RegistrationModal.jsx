import React, { useState, useEffect } from 'react';
import { supabase, isMockMode } from '../../supabaseClient';
import imageCompression from 'browser-image-compression';

export default function RegistrationModal({ event, user, onClose, onSuccess, onRefresh }) {
  const [profile, setProfile] = useState(null);
  
  // 1. Recover step progress automatically if a mobile app-switch reload occurs
  const [currentStep, setCurrentStep] = useState(() => {
    const savedStep = localStorage.getItem(`reg_step_${event?.id}`);
    return savedStep ? parseInt(savedStep, 10) : 1;
  });

  // 2. Recover all text input fields, checkboxes, and selections
  const [answers, setAnswers] = useState(() => {
    const savedAnswers = localStorage.getItem(`reg_answers_${event?.id}`);
    return savedAnswers ? JSON.parse(savedAnswers) : {};
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [selectedTeammates, setSelectedTeammates] = useState([]);
  const [teamName, setTeamName] = useState('');

  // 3. Keep localStorage perfectly updated whenever changes happen
  useEffect(() => {
    if (event?.id) {
      localStorage.setItem(`reg_step_${event.id}`, currentStep);
    }
  }, [currentStep, event?.id]);

  useEffect(() => {
    if (event?.id && Object.keys(answers).length > 0) {
      localStorage.setItem(`reg_answers_${event.id}`, JSON.stringify(answers));
    }
  }, [answers, event?.id]);

  // 4. Clear memory ONLY when the student successfully registers or closes manually
  const clearRegistrationCache = () => {
    if (event?.id) {
      localStorage.removeItem(`reg_step_${event.id}`);
      localStorage.removeItem(`reg_answers_${event.id}`);
    }
  };

  const handleClose = () => {
    clearRegistrationCache();
    onClose();
  };

  useEffect(() => {
    const savedStep = localStorage.getItem(`reg_step_${event?.id}`);
    if (!savedStep) {
      setCurrentStep(1);
    }
    setSuccess(false);
    setErrorMsg('');
  }, [event?.id]);

  useEffect(() => {
    // 1. Tell the whole app to STOP auto-refreshing when this modal turns on
    localStorage.setItem('block_global_refresh', 'true');
    
    return () => {
      // 2. Turn auto-refresh back ON when this modal closes completely
      localStorage.removeItem('block_global_refresh');
    };
  }, []);

  useEffect(() => {
    // Fetch profile of the logged-in student to pre-fill/display
    async function fetchProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setProfile(data);
      } else {
        // Fallback to user metadata if query fails
        setProfile({
          full_name: user.user_metadata?.full_name || '',
          roll_number: user.user_metadata?.roll_number || '',
          branch: user.user_metadata?.branch || '',
          semester: user.user_metadata?.semester || '',
          phone: user.user_metadata?.phone || '',
        });
      }
    }
    fetchProfile();
  }, [user]);

  useEffect(() => {
    async function fetchFriendsList() {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('connections')
        .select(`
          id,
          sender_id,
          receiver_id,
          sender_profile:profiles!sender_id(id, full_name, roll_number, branch),
          receiver_profile:profiles!receiver_id(id, full_name, roll_number, branch)
        `)
        .eq('status', 'ACCEPTED')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (error) {
        console.error("Error fetching friends:", error.message);
        return;
      }

      if (data) {
        const friends = data.map(conn => {
          // Robust check for string ID vs object mapping (e.g. in mock mode)
          const connSenderId = (typeof conn.sender_id === 'object' && conn.sender_id !== null) ? conn.sender_id.id : conn.sender_id;
          if (connSenderId === user.id) {
            return conn.receiver_profile;
          } else {
            return conn.sender_profile;
          }
        }).filter(Boolean);
        setFriendsList(friends);
      }
    }

    if (event?.participation_type === 'Team') {
      fetchFriendsList();
    }
  }, [event, user]);

  const handleCustomFieldChange = (fieldId, value) => {
    setAnswers(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const handleCustomFieldFileUpload = async (e, fieldId) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.target?.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file) return;

    const fileSizeInMB = file.size / (1024 * 1024);
    const field = event?.custom_fields?.find(f => f.id === fieldId);
    const allowedLimit = field?.max_size || 2;
    const fieldLabel = field?.label || 'File';

    if (fileSizeInMB > allowedLimit) {
      alert(`The file size for "${fieldLabel}" must be under ${allowedLimit}MB. Your file is ${fileSizeInMB.toFixed(2)}MB.`);
      return;
    }

    // 1. Instantly write a placeholder state to localStorage to prevent app-switch drops
    const currentAnswers = JSON.parse(localStorage.getItem(`reg_answers_${event?.id}`) || '{}');
    currentAnswers[`uploading_${fieldId}`] = true;
    localStorage.setItem(`reg_answers_${event?.id}`, JSON.stringify(currentAnswers));
    
    setAnswers(prev => ({
      ...prev,
      [`uploading_${fieldId}`]: true
    }));

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}_${Date.now()}.${fileExt}`;
      const filePath = `student-uploads/${fileName}`;

      // 2. Perform the upload to your Supabase storage bucket
      const { error: uploadError } = await supabase.storage
        .from('event-materials')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('event-materials')
        .getPublicUrl(filePath);

      // 3. SUCCESS STATE: Force save immediately to localStorage to survive any background kills
      const updatedAnswers = JSON.parse(localStorage.getItem(`reg_answers_${event?.id}`) || '{}');
      updatedAnswers[fieldId] = publicUrl;
      updatedAnswers[`uploading_${fieldId}`] = false;
      
      localStorage.setItem(`reg_answers_${event?.id}`, JSON.stringify(updatedAnswers));

      // Update local React view layer state
      setAnswers(updatedAnswers);
      alert("✓ File loaded successfully into registration memory!");

    } catch (error) {
      console.error("Upload process failure details:", error.message);
      alert(`Upload failed: ${error.message}`);
      
      setAnswers(prev => ({
        ...prev,
        [`uploading_${fieldId}`]: false
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (event.participation_type === 'Team') {
      if (!teamName.trim()) {
        setErrorMsg('Team Name is required.');
        setLoading(false);
        return;
      }
      const teamSize = 1 + selectedTeammates.length;
      const minSize = event.min_team_size ?? 1;
      const maxSize = event.max_team_size ?? 3;
      if (teamSize < minSize) {
        setErrorMsg(`Your team must have at least ${minSize} members.`);
        setLoading(false);
        return;
      }
      if (teamSize > maxSize) {
        setErrorMsg(`Your team cannot exceed ${maxSize} members.`);
        setLoading(false);
        return;
      }
    }

    // Ensure all custom fields have answers
    const customFields = event.custom_fields || [];
    for (const field of customFields) {
      if (field.required ?? true) {
        const ans = answers[field.id];
        if (!ans || (typeof ans === 'string' && ans.trim() === '') || (Array.isArray(ans) && ans.length === 0)) {
          setErrorMsg(field.type === 'file' 
            ? `The field "${field.label}" is required. Please upload the requested file before submitting.`
            : `The field "${field.label}" is required. Please answer before submitting.`
          );
          setLoading(false);
          return;
        }
      }
    }

    // Process file uploads
    const updatedAnswers = { ...answers };
    try {
      for (const field of customFields) {
        if (field.type === 'file' && answers[field.id] instanceof File) {
          const file = answers[field.id];
          let fileToUpload = file;

          // 1. Size Validation based on specific field limit
           const maxLimitMb = field.max_size || 2;
           const maxLimitBytes = maxLimitMb * 1024 * 1024;

          // PDF Size Validation
          if (file.type === 'application/pdf' && file.size > maxLimitBytes) {
            throw new Error(`PDF files must be smaller than ${maxLimitMb}MB. Please compress your PDF before uploading.`);
          }

          // 2. Image Compression
          if (file.type.startsWith('image/')) {
            try {
              const options = {
                maxSizeMB: Math.min(0.5, maxLimitMb),
                maxWidthOrHeight: 1280,
                useWebWorker: true
              };
              fileToUpload = await imageCompression(file, options);
            } catch (compressionErr) {
              console.error('Image compression failed, using original file:', compressionErr);
              fileToUpload = file;
            }
          }

          // 3. Final Size Validation for all files (post-compression check)
          if (fileToUpload.size > maxLimitBytes) {
            throw new Error(`The file "${field.label}" exceeds the maximum limit of ${maxLimitMb}MB.`);
          }

          const fileExt = fileToUpload.name ? fileToUpload.name.split('.').pop() : 'png';
          const filePath = `${event.id}/${crypto.randomUUID()}.${fileExt}`;

          if (isMockMode) {
            // Simulate storage upload in mock mode
            await new Promise(resolve => setTimeout(resolve, 800));
            const publicUrl = `https://mock-storage.supabase.co/registration_files/${filePath}`;
            updatedAnswers[field.id] = publicUrl;
          } else {
            // Upload to Supabase Storage in live mode
            const { error: uploadError } = await supabase.storage
              .from('registration_files')
              .upload(filePath, fileToUpload);

            if (uploadError) {
              throw new Error(`Failed to upload file "${field.label}": ${uploadError.message}`);
            }

            const { data: urlData } = supabase.storage
              .from('registration_files')
              .getPublicUrl(filePath);

            updatedAnswers[field.id] = urlData.publicUrl;
          }
        }
      }
    } catch (uploadError) {
      setErrorMsg(uploadError.message || 'File upload failed.');
      setLoading(false);
      return;
    }

    let registrationsToInsert = [];

    if (event.participation_type === 'Team') {
      // Primary student row
      registrationsToInsert.push({
        event_id: event.id,
        student_id: user.id,
        custom_answers: {
          ...updatedAnswers,
          _team_name: teamName,
          _teammates: selectedTeammates.map(t => typeof t === 'object' ? t.full_name : t)
        }
      });

      // Teammate rows
      selectedTeammates.forEach(teammate => {
        registrationsToInsert.push({
          event_id: event.id,
          student_id: teammate.id,
          custom_answers: {
            ...updatedAnswers,
            _team_name: teamName,
            _teammates: [
              profile.full_name,
              ...selectedTeammates
                .filter(t => t.id !== teammate.id)
                .map(t => typeof t === 'object' ? t.full_name : t)
            ]
          }
        });
      });
    } else {
      registrationsToInsert.push({
        event_id: event.id,
        student_id: user.id,
        custom_answers: updatedAnswers
      });
    }

    const { error } = await supabase
      .from('registrations')
      .insert(registrationsToInsert);

    if (error) {
      setErrorMsg(error.message || 'One or more teammates (or you) are already registered for this event.');
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
      clearRegistrationCache();
      setTimeout(() => {
        onSuccess();
      }, 2000);
    }
  };

  if (!profile) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl max-w-sm w-full flex flex-col items-center justify-center">
          <svg className="animate-spin h-8 w-8 text-primary-500 mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-medium text-gray-500">Loading profile data...</span>
        </div>
      </div>
    );
  }

  const customFields = event.custom_fields || [];

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        
        {/* 1. PROGRESS HEADER INDICATOR */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Event Registration — Step {currentStep} of 2
            </h3>
            <p className="text-xs text-primary-600 font-semibold truncate max-w-[320px] mt-0.5">{event.title}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              <div className={`w-6 h-1.5 rounded-full transition-all ${currentStep >= 1 ? 'bg-blue-600' : 'bg-slate-200'}`} />
              <div className={`w-6 h-1.5 rounded-full transition-all ${currentStep === 2 ? 'bg-blue-600' : 'bg-slate-200'}`} />
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 2. SCROLLABLE FORM STEP TRACK BODY */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {success ? (
            <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-slate-800 mb-2">Registration Confirmed!</h4>
              <p className="text-sm text-gray-500 max-w-xs">
                You have successfully registered for <strong>{event.title}</strong>. Loading your dashboard...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                {/* STEP 1: EVENT DETAILS & PROFILE VERIFICATION */}
                {currentStep === 1 && (
                  <div className="flex flex-col gap-6 animate-fadeIn">
                    {/* DYNAMIC DOCUMENT & IMAGE PREVIEW BANNER CELL FOR STUDENTS */}
                    {event?.documents && event.documents.length > 0 && (
                      <div className="mb-6 flex flex-col gap-4">
                        {event.documents.map((doc, idx) => {
                          const isImage = doc.url?.match(/\.(jpeg|jpg|gif|png|webp)/i) || !doc.url?.endsWith('.pdf');
                          
                          return (
                            <div key={doc.id || idx} className="w-full">
                              {isImage ? (
                                /* Automatic Inline Image Display */
                                <div className="flex flex-col gap-1.5 border border-slate-100 bg-white p-3 rounded-2xl shadow-sm">
                                  {doc.description && (
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
                                      💡 Reference: {doc.description}
                                    </span>
                                  )}
                                  <div className="w-full max-h-72 rounded-xl overflow-hidden bg-slate-50 border flex items-center justify-center">
                                    <img 
                                      src={doc.url} 
                                      alt={doc.description || 'Event Attachment'} 
                                      className="w-full max-h-72 object-contain"
                                    />
                                  </div>
                                </div>
                              ) : (
                                /* Normal PDF Download Attachment Link */
                                <div className="flex items-center justify-between p-3 bg-slate-50 border rounded-xl text-xs">
                                  <span className="font-medium text-slate-600">📄 {doc.description || 'Reference Guide'}</span>
                                  <a href={doc.url} target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline">
                                    Download PDF
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Event Description & Timing Details */}
                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-3">
                      <div>
                        <h4 className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Event Details</h4>
                        <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                          {event?.description || "No description provided for this event."}
                        </p>
                      </div>
                      
                      <div className="pt-2 border-t border-slate-200/50 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px] font-semibold">
                        <div>
                          <span className="text-gray-400 uppercase tracking-wider block">Registration Deadline</span>
                          <span className="font-bold text-slate-700 mt-0.5 block">
                            {event?.registration_deadline ? new Date(event.registration_deadline).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 uppercase tracking-wider block">Event Date & Duration</span>
                          <span className="font-bold text-primary-600 mt-0.5 block">
                            {event?.event_start_date ? new Date(event.event_start_date).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'} ({event?.duration_days} {event?.duration_days === 1 ? 'Day' : 'Days'})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Student Details Summary */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Academic Profile Info</h4>
                      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                        <div>
                          <span className="text-gray-400 block mb-0.5">Full Name</span>
                          <span className="font-semibold text-slate-700">{profile.full_name}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block mb-0.5">Roll Number</span>
                          <span className="font-semibold text-slate-700">{profile.roll_number || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block mb-0.5">Branch / Course</span>
                          <span className="font-semibold text-slate-700">{profile.branch || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block mb-0.5">Semester</span>
                          <span className="font-semibold text-slate-700">{profile.semester || 'N/A'}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-400 block mb-0.5">Phone Number</span>
                          <span className="font-semibold text-slate-700">{profile.phone || 'N/A'}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-3 pt-3 border-t border-slate-200/65">
                        Need to update your details? Close this modal and edit your profile in the sidebar.
                      </p>
                    </div>
                  </div>
                )}

                {/* STEP 2: TEAM CONFIGURATION & SUBMISSION OPTION */}
                {currentStep === 2 && (
                  <div className="flex flex-col gap-6 animate-fadeIn">
                    {/* Team Formation UI */}
                    {event.participation_type === 'Team' && (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                        <div>
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Form Your Team</h4>
                          <p className="text-[11px] text-gray-400 mt-1">Provide a team name and select teammates from your accepted connections.</p>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase">Team Name</label>
                          <input 
                            type="text" 
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            placeholder="Enter a creative name for your team..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                            required
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-100 font-semibold">
                          <span>Required Size: <strong className="text-slate-700">{event.min_team_size || 1} - {event.max_team_size || 3} members</strong></span>
                          <span>Current Size: <strong className={1 + selectedTeammates.length < (event.min_team_size || 1) || 1 + selectedTeammates.length > (event.max_team_size || 3) ? "text-rose-500" : "text-emerald-500"}>{1 + selectedTeammates.length}</strong></span>
                        </div>
                        
                        {friendsList.length === 0 ? (
                          <div className="text-xs text-gray-400 italic bg-white p-3 rounded-lg border border-slate-100 text-center">
                            No accepted friend connections found. Add connections in your student hub to form teams.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {friendsList.map((friend) => {
                              if (!friend || !friend.id) return null;
                              const isChecked = selectedTeammates.some(t => t.id === friend.id);
                              return (
                                <label key={friend.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors text-xs">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      if (isChecked) {
                                        setSelectedTeammates(selectedTeammates.filter(t => t.id !== friend.id));
                                      } else {
                                        setSelectedTeammates([...selectedTeammates, friend]);
                                      }
                                    }}
                                    className="rounded border-slate-300 text-primary-500 focus:ring-primary-500/20 w-4 h-4"
                                  />
                                  <div>
                                    <span className="font-semibold text-slate-700 block">{friend.full_name}</span>
                                    <span className="text-[9px] text-gray-400 block">{friend.roll_number || 'No Roll #'} • {friend.branch || 'No Dept'}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dynamic Custom Questions */}
                    {customFields.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Organizer Additional Questions</h4>
                        {customFields.map((field) => (
                          <div key={field.id} className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">
                              {field.label} <span className="text-rose-500">*</span>
                            </label>
                            {field.type === 'select' ? (
                              <select
                                required
                                value={answers[field.id] || ''}
                                onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
                              >
                                <option value="">Select an option</option>
                                {field.options && field.options.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : field.type === 'mcq' ? (
                              field.allow_multiple ? (
                                <div className="space-y-2 mt-1">
                                  {field.options && field.options.map((opt) => {
                                    const currentAnswers = Array.isArray(answers[field.id]) ? answers[field.id] : [];
                                    const isChecked = currentAnswers.includes(opt);
                                    return (
                                      <label key={opt} className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer text-xs">
                                        <input
                                          type="checkbox"
                                          name={field.id}
                                          value={opt}
                                          checked={isChecked}
                                          onChange={(e) => {
                                            let newAnswers;
                                            if (e.target.checked) {
                                              newAnswers = [...currentAnswers, opt];
                                            } else {
                                              newAnswers = currentAnswers.filter(item => item !== opt);
                                            }
                                            handleCustomFieldChange(field.id, newAnswers);
                                          }}
                                          className="w-4 h-4 rounded text-primary-600 border-slate-300 focus:ring-primary-500"
                                        />
                                        <span className="text-slate-700 font-semibold">{opt}</span>
                                      </label>
                                    );
                                  })}
                                  {(!field.options || field.options.length === 0) && (
                                    <p className="text-[11px] text-gray-400 italic">No options configured for this MCQ question.</p>
                                  )}
                                </div>
                              ) : (
                                <select
                                  required
                                  value={answers[field.id] || ''}
                                  onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
                                >
                                  <option value="">Select an option</option>
                                  {field.options && field.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              )
                            ) : field.type === 'text_area' ? (
                              <textarea
                                required
                                rows={3}
                                value={answers[field.id] || ''}
                                onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                                placeholder="Type your answer here..."
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs resize-none"
                              />
                            ) : field.type === 'file' ? (
                              /* DIRECT-BOUND NATIVE FILE COMPONENT MODULE */
                              <div className="flex flex-col gap-2 w-full mt-2 text-left" onClick={(e) => e.stopPropagation()}>
                                <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3">
                                  {/* Explicit Native File Selector: Bypasses hidden click loops that trigger browser resets */}
                                  <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        // Fire your upload routine instantly to stream the data to Supabase 
                                        // before the OS can clear the background state
                                        handleCustomFieldFileUpload(e, field.id);
                                      }
                                    }}
                                    className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 transition-all cursor-pointer bg-white border border-slate-100 p-2"
                                  />

                                  {/* PERSISTENT MEMORY CHECK */}
                                  {answers[field.id] && (
                                    <div className="mt-1 p-2 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2">
                                      <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">
                                        ✓ File Saved to Registration Memory
                                      </span>
                                    </div>
                                  )}
                                  
                                  {answers[`uploading_${field.id}`] && (
                                    <span className="text-xs text-slate-400 animate-pulse">Uploading file securely...</span>
                                  )}
                                </div>
                                {answers[field.id] && (
                                  <div className="text-[10px] text-gray-400 truncate max-w-xs pl-2">
                                    Url: <a href={answers[field.id]} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{answers[field.id]}</a>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <input
                                type="text"
                                required
                                value={answers[field.id] || ''}
                                onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                                placeholder="Type your answer here..."
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. MODAL NAVIGATION ACTION FOOTER */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                {currentStep === 1 ? (
                  <button type="button" onClick={handleClose} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                ) : (
                  <button type="button" onClick={() => setCurrentStep(1)} className="px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                    ← Back
                  </button>
                )}

                {currentStep === 1 ? (
                  <button type="button" onClick={() => setCurrentStep(2)} className="px-5 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 shadow-sm transition-all">
                    Next Step →
                  </button>
                ) : (
                  <button type="submit" disabled={loading} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-all flex items-center gap-2">
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Submitting...
                      </>
                    ) : (
                      'Submit Registration'
                    )}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
