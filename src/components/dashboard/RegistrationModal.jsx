import React, { useState, useEffect } from 'react';
import { supabase, isMockMode } from '../../supabaseClient';
import imageCompression from 'browser-image-compression';
import { useToast } from '../ui/Toast';

export default function RegistrationModal({ event, user, onClose, onSuccess, onRefresh }) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);

  // Helper to read registration draft from localStorage with 30-minute expiry
  const getRegistrationDraft = (key, fallback) => {
    try {
      const draftStr = event?.id ? localStorage.getItem(`eventRegistrationDraft:${event.id}`) : null;
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        const savedAt = draft.savedAt || 0;
        if (Date.now() - savedAt > 30 * 60 * 1000) { // older than 30 mins
          localStorage.removeItem(`eventRegistrationDraft:${event.id}`);
          return fallback;
        }
        if (draft[key] !== undefined) return draft[key];
      }
    } catch (e) {
      console.error(e);
    }
    return fallback;
  };

  const [answers, setAnswers] = useState(() => {
    const draftAns = getRegistrationDraft('answers', null);
    if (draftAns) return draftAns;
    const saved = event?.id ? localStorage.getItem(`reg_answers_${event.id}`) : null;
    return saved ? JSON.parse(saved) : {};
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [squad, setSquad] = useState([]);
  const [selectedTeammates, setSelectedTeammates] = useState(() => getRegistrationDraft('selectedTeammates', []));
  const [teamName, setTeamName] = useState(() => getRegistrationDraft('teamName', ''));
  const [currentStep, setCurrentStep] = useState(() => {
    const draftStep = getRegistrationDraft('currentStep', null);
    if (draftStep) return draftStep;
    const savedStep = localStorage.getItem('active_wizard_step');
    return savedStep ? parseInt(savedStep, 10) : 1;
  });

  // Automatically save form draft state to localStorage on every change
  useEffect(() => {
    if (!event?.id) return;
    
    const draft = {
      currentStep,
      teamName,
      selectedTeammates,
      answers: {},
      savedAt: Date.now()
    };
    
    Object.keys(answers).forEach(key => {
      const val = answers[key];
      if (val instanceof File) {
        draft.answers[key] = {
          fileName: val.name,
          fileAttachedPlaceholder: true
        };
      } else {
        draft.answers[key] = val;
      }
    });
    
    localStorage.setItem(`eventRegistrationDraft:${event.id}`, JSON.stringify(draft));
  }, [currentStep, teamName, selectedTeammates, answers, event?.id]);

  const handleStepNavigation = (targetStep) => {
    setCurrentStep(targetStep);
    localStorage.setItem('active_wizard_step', targetStep.toString());
  };

  const handleClose = () => {
    localStorage.removeItem('active_wizard_step');
    localStorage.removeItem(`reg_answers_${event?.id}`);
    if (event?.id) {
      localStorage.removeItem(`eventRegistrationDraft:${event.id}`);
    }
    onClose();
  };

  useEffect(() => {
    const draftStr = event?.id ? localStorage.getItem(`eventRegistrationDraft:${event.id}`) : null;
    if (!draftStr) {
      const savedStep = localStorage.getItem('active_wizard_step');
      if (!savedStep) {
        setCurrentStep(1);
      }
    }
    setSuccess(false);
    setErrorMsg('');
  }, [event?.id]);

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
    const fetchSquadMembers = async () => {
      if (event?.participation_type !== 'Team' || !user?.id) return;

      try {
        const { data, error } = await supabase
          .from('connections')
          .select(`
            id,
            sender_id,
            receiver_id,
            sender_profile:profiles!sender_id(id, username, full_name),
            receiver_profile:profiles!receiver_id(id, username, full_name)
          `)
          .eq('status', 'ACCEPTED')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

        if (error) throw error;

        // Map profiles out to determine who the friend is relative to the current user
        const friendsListMapped = (data || []).map(conn => {
          const connSenderId = (typeof conn.sender_id === 'object' && conn.sender_id !== null) ? conn.sender_id.id : conn.sender_id;
          return connSenderId === user.id ? conn.receiver_profile : conn.sender_profile;
        }).filter(Boolean);

        setSquad(friendsListMapped);
      } catch (err) {
        console.error("Error loading teammates:", err.message);
      }
    };

    fetchSquadMembers();
  }, [event, user]);

  const handleCustomFieldChange = (fieldId, value) => {
    setAnswers(prev => {
      const updated = {
        ...prev,
        [fieldId]: value
      };
      localStorage.setItem(`reg_answers_${event?.id}`, JSON.stringify(updated));
      return updated;
    });
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (event?.registration_deadline && new Date() > new Date(event.registration_deadline)) {
      setErrorMsg("Error: The registration deadline for this event has already passed.");
      setLoading(false);
      return;
    }

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
      const ans = answers[field.id];
      if (!ans || (typeof ans === 'string' && ans.trim() === '') || (Array.isArray(ans) && ans.length === 0)) {
        setErrorMsg(`Please answer the custom question: "${field.label}"`);
        setLoading(false);
        return;
      }
      if (field.type === 'file' && ans.fileAttachedPlaceholder) {
        setErrorMsg(`Please re-select the file for "${field.label}" to proceed.`);
        setLoading(false);
        return;
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
          const filePath = `student-uploads/${Date.now()}_${fileToUpload.name || 'file.' + fileExt}`;

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
        team_name: teamName.trim(),
        team_members: selectedTeammates,
        is_captain: true,
        custom_answers: {
          ...updatedAnswers,
          _team_name: teamName,
          _teammates: selectedTeammates.map(tId => {
            const friend = squad.find(f => f.id === tId);
            return friend ? friend.full_name : tId;
          })
        }
      });

      // Teammate rows
      selectedTeammates.forEach(teammateId => {
        registrationsToInsert.push({
          event_id: event.id,
          student_id: teammateId,
          team_name: teamName.trim(),
          team_members: selectedTeammates,
          is_captain: false,
          custom_answers: {
            ...updatedAnswers,
            _team_name: teamName,
            _teammates: [
              profile?.full_name || 'Captain',
              ...selectedTeammates
                .filter(id => id !== teammateId)
                .map(id => {
                  const friend = squad.find(f => f.id === id);
                  return friend ? friend.full_name : id;
                })
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

    // Pre-check for duplicate registrations for this specific event_id
    try {
      const allParticipantIds = [user.id, ...selectedTeammates];
      
      const { data: existingEntries, error: checkError } = await supabase
        .from('registrations')
        .select('student_id, profiles:student_id(full_name)')
        .eq('event_id', event.id)
        .in('student_id', allParticipantIds);

      if (checkError) throw checkError;

      if (existingEntries && existingEntries.length > 0) {
        const duplicateNames = existingEntries.map(entry => entry.profiles?.full_name || 'A teammate').join(', ');
        setErrorMsg(`❌ Cannot register: ${duplicateNames} is already registered for this event in another team!`);
        setLoading(false);
        return;
      }
    } catch (checkErr) {
      console.error("Pre-registration validation check failed:", checkErr);
    }

    try {
      const { error } = await supabase
        .from('registrations')
        .insert(registrationsToInsert);

      if (error) throw error;

      setSuccess(true);
      setLoading(false);
      localStorage.removeItem('active_wizard_step');
      localStorage.removeItem(`reg_answers_${event?.id}`);
      if (event?.id) {
        localStorage.removeItem(`eventRegistrationDraft:${event.id}`);
      }
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
      setTimeout(() => {
        onSuccess();
      }, 2000);

    } catch (err) {
      console.error("Registration sub-error intercepted:", err);

      // Catch the unique constraint violation thrown by the database
      if (err.message?.includes('registrations_event_id_student_id_key') || err.code === '23505') {
        const duplicateMemberName = selectedTeammates?.map(tId => {
          const friend = squad.find(f => f.id === tId);
          return friend ? friend.full_name : tId;
        }).join(', ') || "One of your selected friends";
        setErrorMsg(`❌ Cannot register: ${duplicateMemberName} is already registered for this event in another team!`);
        setLoading(false);
        return;
      }

      setErrorMsg(err.message || "An unexpected error occurred during submission.");
      setLoading(false);
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

  const customFields = event?.custom_fields || [];
  const customFieldsLength = customFields.length;
  const totalSteps = customFieldsLength > 0 ? 2 : 1;
  const headerStepText = `Event Registration — Step ${currentStep} of ${totalSteps}`;
  const isLastStep = currentStep === totalSteps;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        
        {/* 1. PROGRESS HEADER INDICATOR */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              {headerStepText}
            </h3>
            <p className="text-xs text-primary-600 font-semibold truncate max-w-[320px] mt-0.5">{event.title}</p>
          </div>
          <div className="flex items-center gap-4">
            {totalSteps > 1 && (
              <div className="flex gap-1">
                <div className={`w-6 h-1.5 rounded-full transition-all ${currentStep >= 1 ? 'bg-blue-600' : 'bg-slate-200'}`} />
                <div className={`w-6 h-1.5 rounded-full transition-all ${currentStep === 2 ? 'bg-blue-600' : 'bg-slate-200'}`} />
              </div>
            )}
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
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                {currentStep === 1 && (
                  <div className="flex flex-col gap-6 animate-fadeIn">
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

                    {/* 🚀 SMART CONDITION: RENDER TEAM SETTINGS ONLY IF PARTICIPATION TYPE IS TEAM */}
                    {event?.participation_type === 'Team' && (
                      <div className="flex flex-col gap-4 p-5 border border-indigo-100 bg-indigo-50/20 rounded-2xl animate-fadeIn mb-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Team Setup Required</span>
                          <h3 className="text-xs font-bold text-slate-700">Enter your squad details to complete registration</h3>
                        </div>

                        {/* 1. TEAM NAME INPUT FIELD */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Team Name</label>
                          <input
                            type="text"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            placeholder="Enter your unique team name"
                            className="h-11 w-full px-4 bg-white border border-slate-200 focus:border-indigo-500 text-xs font-medium text-slate-700 rounded-xl transition-all outline-none"
                          />
                        </div>

                        {/* 2. FRIENDS / SQUAD SELECTION GRID LIST */}
                        <div className="flex flex-col gap-1.5 mt-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Select Teammates ({selectedTeammates.length} selected)
                          </label>
                          
                          {squad.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                              {squad.map((friend) => {
                                const isChecked = selectedTeammates.includes(friend.id);
                                return (
                                  <label 
                                    key={friend.id}
                                    className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer text-xs font-medium transition-all ${
                                      isChecked 
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-bold' 
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50/70'
                                    }`}
                                  >
                                    <div className="flex flex-col">
                                      <span>{friend.full_name}</span>
                                      <span className="text-[10px] text-slate-400 font-normal">@{friend.username}</span>
                                    </div>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        if (isChecked) {
                                          setSelectedTeammates(selectedTeammates.filter(id => id !== friend.id));
                                        } else {
                                          setSelectedTeammates([...selectedTeammates, friend.id]);
                                        }
                                      }}
                                      className="w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-4 text-center border border-dashed border-slate-200 bg-white rounded-xl text-[11px] text-slate-400">
                              No squad members found. Go to your Friends dashboard to add teammates first!
                            </div>
                          )}
                        </div>
                      </div>
                    )}

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
                  </div>
                )}

                {/* STEP 2: TEAM CONFIGURATION & SUBMISSION OPTION */}
                {currentStep === 2 && (
                  <div className="flex flex-col gap-6 animate-fadeIn">
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
                              <div className="space-y-1.5">
                                 <input
                                   type="file"
                                   accept="application/pdf, image/*"
                                   required={!answers[field.id]}
                                   onChange={async (e) => {
                                     e.preventDefault();
                                     e.stopPropagation();
                                     
                                     const file = e.target.files?.[0];
                                     if (!file) return;

                                     // Get the custom limit set by the organizer (Default fallback to 2MB if not specified)
                                     const maxAllowedMb = field.max_size || event?.max_file_size_limit || 2; 
                                     const maxAllowedBytes = maxAllowedMb * 1024 * 1024;

                                     // Validate the file size before doing anything else
                                     if (file.size > maxAllowedBytes) {
                                       showToast(`File too large! The organizer has limited uploads for this event to ${maxAllowedMb}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`, 'error');
                                       
                                       // Clear the input element target reset
                                       e.target.value = "";
                                       return;
                                     }

                                     console.log("🚀 File size validated successfully. Starting upload sequence...");
                                     handleCustomFieldChange(field.id, file);
                                   }}
                                   className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
                                 />
                                {answers[field.id] && (
                                  <div className="text-[11px] font-semibold flex items-center gap-1.5">
                                    {answers[field.id].fileAttachedPlaceholder ? (
                                      <span className="text-amber-600 flex items-center gap-1">
                                        ⚠️ File Selected: <strong>{answers[field.id].fileName}</strong> (Please re-select file after reload)
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600 flex items-center gap-1">
                                        ✅ Attached: <strong>{answers[field.id].name || answers[field.id].fileName}</strong>
                                      </span>
                                    )}
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
                {currentStep > 1 ? (
                  <button type="button" onClick={() => handleStepNavigation(currentStep - 1)} className="px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                    ← Back
                  </button>
                ) : (
                  <button type="button" onClick={handleClose} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                )}

                {isLastStep ? (
                  <button type="button" onClick={handleSubmit} disabled={loading} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-all flex items-center gap-2">
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
                ) : (
                  <button type="button" onClick={() => handleStepNavigation(currentStep + 1)} className="px-5 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 shadow-sm transition-all">
                    Next Step →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
