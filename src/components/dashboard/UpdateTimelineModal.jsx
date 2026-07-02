// src/components/dashboard/UpdateTimelineModal.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const formatDateForInput = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  
  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function UpdateTimelineModal({ event, onClose, onSuccess }) {
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (event) {
      setRegistrationDeadline(formatDateForInput(event.registration_deadline));
      setEventStartDate(formatDateForInput(event.event_start_date));
      setDurationDays(event.duration_days || 1);
    }
  }, [event]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const deadlineParsed = new Date(registrationDeadline);
    const startDateParsed = new Date(eventStartDate);

    // Guard rails: Check for invalid date formatting inputs
    if (isNaN(deadlineParsed.getTime()) || isNaN(startDateParsed.getTime())) {
      setErrorMsg("Please ensure your date and time formats are complete.");
      setLoading(false);
      return;
    }

    // Map payload explicitly using .toISOString() to prevent timezone shifting
    const updatePayload = {
      registration_deadline: deadlineParsed.toISOString(),
      event_start_date: startDateParsed.toISOString(),
      duration_days: parseInt(durationDays, 10) || 1
    };

    // Reset status to OPEN if the extended deadline is in the future
    if (deadlineParsed > new Date()) {
      updatePayload.status = 'OPEN';
    }

    const { error } = await supabase
      .from('events')
      .update(updatePayload)
      .eq('id', event.id);

    if (error) {
      setErrorMsg(error.message || 'Failed to update timeline.');
      setLoading(false);
    } else {
      alert('Event timeline updated successfully!');
      setLoading(false);
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Update Event Timeline</h3>
            <p className="text-xs text-gray-500 font-medium truncate max-w-[320px]">{event?.title}</p>
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
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMsg && (
              <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            {/* Registration Deadline */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Registration Deadline</label>
              <input
                type="datetime-local"
                required
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
              />
            </div>

            {/* Event Start Date */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Event Start Date</label>
              <input
                type="datetime-local"
                required
                value={eventStartDate}
                onChange={(e) => setEventStartDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs bg-white"
              />
            </div>

            {/* Total Duration */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Total Duration (Days)</label>
              <input
                type="number"
                min="1"
                required
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-xs"
              />
            </div>

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
                className="bg-primary-500 hover:bg-primary-600 disabled:bg-primary-400 text-white font-semibold py-2.5 px-6 rounded-xl shadow-md transition-all text-xs flex items-center gap-2"
              >
                {loading ? 'Updating...' : 'Save Timeline'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
