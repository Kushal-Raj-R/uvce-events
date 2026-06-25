import React, { useState, useEffect } from 'react';
import { supabase, isMockMode } from '../../supabaseClient';
import imageCompression from 'browser-image-compression';

export default function RegistrationModal({ event, user, onClose, onSuccess }) {
  const [profile, setProfile] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

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

  const handleCustomFieldChange = (fieldId, value) => {
    setAnswers(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    // Ensure all custom fields have answers
    const customFields = event.custom_fields || [];
    for (const field of customFields) {
      const ans = answers[field.id];
      if (!ans || (typeof ans === 'string' && ans.trim() === '')) {
        setErrorMsg(`Please answer the custom question: "${field.label}"`);
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

          // 1. PDF Size Validation (2MB limit)
          if (file.type === 'application/pdf' && file.size > 2 * 1024 * 1024) {
            throw new Error(`PDF files must be smaller than 2MB. Please compress your PDF before uploading.`);
          }

          // 2. Image Compression
          if (file.type.startsWith('image/')) {
            try {
              const options = {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 1280,
                useWebWorker: true
              };
              fileToUpload = await imageCompression(file, options);
            } catch (compressionErr) {
              console.error('Image compression failed, using original file:', compressionErr);
              fileToUpload = file;
            }
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

    const registrationData = {
      event_id: event.id,
      student_id: user.id,
      custom_answers: updatedAnswers
    };

    const { error } = await supabase
      .from('registrations')
      .insert(registrationData);

    if (error) {
      setErrorMsg(error.message || 'Already registered or failed to register.');
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-fade-in my-8">
        {/* Header */}
        <div className="px-6 py-4 bg-primary-50 border-b border-primary-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Event Registration</h3>
            <p className="text-xs text-primary-600 font-semibold truncate max-w-[320px]">{event.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
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
            <form onSubmit={handleSubmit} className="space-y-6">
              {errorMsg && (
                <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-semibold">
                  {errorMsg}
                </div>
              )}

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
                        <input
                          type="file"
                          accept="application/pdf, image/*"
                          required
                          onChange={(e) => handleCustomFieldChange(field.id, e.target.files[0])}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
                        />
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

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-xs font-semibold text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2.5 px-6 rounded-xl shadow-md shadow-primary-500/10 hover:shadow-lg transition-all flex items-center gap-2 text-xs"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Registering...
                    </>
                  ) : (
                    'Confirm Registration'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
