// src/components/dashboard/RegistrantsListModal.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

export default function RegistrantsListModal({ event, onClose }) {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchRegistrants() {
      setLoading(true);
      setErrorMsg('');
      
      const { data, error } = await supabase
        .from('registrations')
        .select(`
          id,
          custom_answers,
          solution_url,
          created_at,
          profiles:student_id (full_name, username, college_name, roll_number, branch, semester, phone, email, role)
        `)
        .eq('event_id', event.id);

      if (error) {
        setErrorMsg(error.message || 'Failed to fetch registered students.');
      } else {
        const sorted = (data || []).sort((a, b) => {
          const nameA = (a.profiles?.full_name || '').toLowerCase();
          const nameB = (b.profiles?.full_name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        setRegistrations(sorted);
      }
      setLoading(false);
    }

    if (event?.id) {
      fetchRegistrants();
    }
  }, [event]);

  const isTeamEvent = event.participation_type === 'Team';

  // Compute sorted registrations dynamically based on type (Team Name vs. Student Name)
  const organizedRegistrations = [...(registrations || [])].sort((a, b) => {
    if (isTeamEvent) {
      const teamA = (a.custom_answers?._team_name || '').toLowerCase();
      const teamB = (b.custom_answers?._team_name || '').toLowerCase();
      return teamA.localeCompare(teamB);
    } else {
      const nameA = (a.profiles?.full_name || '').toLowerCase();
      const nameB = (b.profiles?.full_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    }
  });

  // Get unique teams with their solution urls
  const uniqueTeams = [];
  const teamNamesSeen = new Set();
  registrations.forEach(reg => {
    const teamName = reg.custom_answers?._team_name || 'N/A';
    if (teamName !== 'N/A' && !teamNamesSeen.has(teamName)) {
      teamNamesSeen.add(teamName);
      uniqueTeams.push({
        team_name: teamName,
        solution_url: reg.solution_url
      });
    }
  });



  const handleExportPDF = () => {
    // 1. Establish a new detached print viewport canvas context window
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // 2. Build a lookup dictionary mapping custom field IDs to real human-readable questions
    const questionLookup = {};
    if (event?.custom_fields && Array.isArray(event.custom_fields)) {
      event.custom_fields.forEach(q => {
        questionLookup[q.id] = q.label;
      });
    }

    // 3. Dynamic Column Width Weights Calculation
    const isAllColleges = event?.event_scope === 'ALL';
    const baseColWidth = isAllColleges ? "11%" : "13%";
    const emailColWidth = isAllColleges ? "16%" : "18%";
    
    // 4. Map structural registration items to safe table rows
    const tableRows = registrations.map(reg => {
      const student = reg.profiles || {};
      const resolvedEmail = student.email || reg.student?.email || reg.profiles?.email_address || reg.student?.email_address || 'Pending sync';
      
      // Convert JSON database answers into readable "Question: Answer" layout blocks
      const formattedAnswers = Object.entries(reg.custom_answers || {})
        .map(([fieldId, answer]) => {
          if (fieldId === '_team_name') {
            return `<div style="margin-bottom: 4px; background: #f1f5f9; padding: 4px 6px; border-radius: 4px;">
                      <strong style="color: #475569;">Team Name:</strong> ${answer}
                    </div>`;
          }
          const realQuestion = questionLookup[fieldId] || fieldId; // Fallback to raw ID if not found
          return `<div style="margin-bottom: 4px; background: #f1f5f9; padding: 4px 6px; border-radius: 4px;">
                    <strong style="color: #475569;">${realQuestion}:</strong> ${answer}
                  </div>`;
        }).join('');

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px; page-break-inside: avoid;">
          <td style="padding: 10px; font-weight: 600; color: #0f172a;">${student.full_name || 'Anonymous User'}</td>
          <td style="padding: 10px; font-family: monospace; color: #334155;">${student.roll_number || 'N/A'}</td>
          ${isAllColleges ? `<td style="padding: 10px; color: #2563eb; font-weight: bold;">${student.college_name || 'UVCE'}</td>` : ''}
          <td style="padding: 10px; color: #475569;">${student.branch || 'N/A'}</td>
          <td style="padding: 10px; color: #475569;">${student.semester || 'N/A'}</td>
          <td style="padding: 10px; color: #475569; word-break: break-all;">${resolvedEmail}</td>
          <td style="padding: 10px; font-family: monospace; color: #334155;">${student.phone || 'N/A'}</td>
          <td style="padding: 10px; vertical-align: top;">${formattedAnswers || '<span style="color:#94a3b8;">N/A</span>'}</td>
        </tr>
      `;
    }).join('');

    // 5. Compile document with fluid table properties
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${event?.title || 'Registrations'}_Report</title>
        <style>
          @page { size: A4 landscape; margin: 12mm 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; }
          .header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; }
          
          /* 🚀 DYNAMIC AUTO-SIZING TABLE SETUP */
          table { 
            width: 100%; 
            table-layout: auto; 
            border-collapse: collapse; 
            text-align: left;
            page-break-inside: auto;
          }
          th { background-color: #1e3a8a; color: white; padding: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          tr:nth-child(even) { background-color: #f8fafc; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0; font-size: 20px; color: #1e3a8a;">Event Registration Roster</h1>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">Event: <strong>${event?.title || 'Event Roster'}</strong> | Scope: ${isAllColleges ? 'Open to All' : 'UVCE Internal'}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: ${baseColWidth};">Student Name</th>
              <th style="width: ${baseColWidth};">Roll Number</th>
              ${isAllColleges ? `<th style="width: 10%;">College</th>` : ''}
              <th style="width: 8%;">Branch</th>
              <th style="width: 9%;">Semester</th>
              <th style="width: ${emailColWidth};">Email</th>
              <th style="width: ${baseColWidth};">Phone Number</th>
              <th style="width: auto;">Custom Form Answers</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); window.close(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Registrant List</h3>
            <p className="text-xs text-gray-500 font-medium truncate max-w-[400px]">
              Showing students registered for <strong>{event.title}</strong>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {registrations.length > 0 && (
              <button
                onClick={handleExportPDF}
                className="h-9 px-4 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm flex items-center gap-2"
              >
                <span>📊</span> Export Registration PDF
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-primary-500 mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs text-gray-400 font-medium">Fetching registered students...</span>
            </div>
          ) : errorMsg ? (
            <div className="p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-sm font-semibold">
              {errorMsg}
            </div>
          ) : registrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 bg-slate-100 text-gray-400 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h4 className="font-semibold text-slate-700 text-sm">No registrations yet</h4>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                As soon as students sign up for this event, they will be listed here.
              </p>
            </div>
          ) : (
            <>
              <div className="w-full overflow-x-auto border border-slate-100 rounded-xl shadow-sm">
              <table className="min-w-full text-left border-collapse divide-y divide-slate-100">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-gray-400 tracking-wider">
                    <th className="py-3 px-4 min-w-[140px] whitespace-normal break-words">Student Name</th>
                    <th className="py-3 px-4 min-w-[120px] whitespace-normal break-words">Roll Number</th>
                    {event?.event_scope === 'ALL' && (
                      <th className="py-3 px-4 min-w-[150px] whitespace-normal break-words animate-fade-in">College</th>
                    )}
                    <th className="py-3 px-4 min-w-[100px] whitespace-normal break-words">Branch</th>
                    <th className="py-3 px-4 min-w-[110px] whitespace-normal break-words">Semester</th>
                    <th className="py-3 px-4 min-w-[180px] whitespace-normal break-words">Email</th>
                    <th className="py-3 px-4 min-w-[130px] whitespace-normal break-words">Phone Number</th>
                    {isTeamEvent && (
                      <th className="py-3 px-4 min-w-[120px] whitespace-normal break-words">Team Name</th>
                    )}
                    {event.custom_fields && event.custom_fields.map(field => (
                      <th key={field.id} className="py-3 px-4 min-w-[150px] max-w-xs whitespace-normal break-words">{field.label}</th>
                    ))}
                    <th className="py-3 px-4 text-right min-w-[120px] whitespace-normal break-words">Registration Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {organizedRegistrations.map((reg) => {
                    const student = reg.profiles || {};
                    const resolvedEmail = student.email || reg.student?.email || reg.profiles?.email_address || reg.student?.email_address || 'Pending sync';
                    return (
                      <tr key={reg.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-800 min-w-[140px] whitespace-normal break-words">
                          {student.full_name || 'Anonymous User'}
                        </td>
                        <td className="py-3.5 px-4 font-medium min-w-[120px] whitespace-normal break-words">{student.roll_number || 'N/A'}</td>
                        {event?.event_scope === 'ALL' && (
                          <td className="py-3.5 px-4 font-bold text-blue-600 uppercase tracking-wide min-w-[150px] whitespace-normal break-words animate-fade-in">
                            {student.college_name || 'UVCE'}
                          </td>
                        )}
                        <td className="py-3.5 px-4 text-gray-500 min-w-[100px] whitespace-normal break-words">{student.branch || 'N/A'}</td>
                        <td className="py-3.5 px-4 font-medium text-primary-500 min-w-[110px] whitespace-normal break-words">{student.semester || 'N/A'}</td>
                        <td className="py-3.5 px-4 text-gray-500 min-w-[180px] whitespace-normal break-words">{resolvedEmail}</td>
                        <td className="py-3.5 px-4 text-gray-500 min-w-[130px] whitespace-normal break-words">{student.phone || 'N/A'}</td>
                        {isTeamEvent && (
                          <td className="py-3.5 px-4 font-semibold text-slate-800 min-w-[120px] whitespace-normal break-words">
                            {reg.custom_answers?._team_name || 'N/A'}
                          </td>
                        )}
                        {event.custom_fields && event.custom_fields.map(field => {
                          const answer = reg.custom_answers?.[field.id];
                          const isUrl = typeof answer === 'string' && (answer.startsWith('http://') || answer.startsWith('https://'));
                          return (
                            <td key={field.id} className="py-3.5 px-4 font-medium text-slate-800 min-w-[150px] max-w-xs whitespace-normal break-words">
                              {isUrl ? (
                                <a 
                                  href={answer} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
                                >
                                  📄 View File
                                </a>
                              ) : (
                                Array.isArray(answer) ? answer.join(', ') : (answer || <span className="text-gray-300 italic">No answer</span>)
                              )}
                            </td>
                          );
                        })}

                        <td className="py-3.5 px-4 text-right text-gray-400 min-w-[120px] whitespace-normal break-words">
                          {reg.created_at ? new Date(reg.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {isTeamEvent && (
              <div className="mt-8 space-y-4 animate-fade-in">
                <div className="border-b border-slate-100 pb-2">
                  <h4 className="text-sm font-bold text-slate-800">Team Solutions Directory</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Quick access summary of submitted solutions grouped by team name.</p>
                </div>
                
                <div className="w-full max-w-2xl overflow-x-auto border border-slate-100 rounded-xl shadow-sm bg-white">
                  <table className="min-w-full text-left border-collapse divide-y divide-slate-100">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-gray-400 tracking-wider">
                        <th className="py-3 px-4 min-w-[200px] whitespace-normal break-words">Team Name</th>
                        <th className="py-3 px-4 min-w-[200px] whitespace-normal break-words">Solution PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {uniqueTeams.length === 0 ? (
                        <tr>
                          <td colSpan="2" className="py-4 px-4 text-center text-slate-400 italic">
                            No team solutions have been submitted yet.
                          </td>
                        </tr>
                      ) : (
                        uniqueTeams.map((team, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 px-4 font-semibold text-slate-800 min-w-[200px] whitespace-normal break-words">
                              {team.team_name}
                            </td>
                            <td className="py-3.5 px-4 font-medium min-w-[200px] whitespace-normal break-words">
                              {team.solution_url ? (
                                <a 
                                  href={team.solution_url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-blue-600 hover:underline font-semibold inline-flex items-center gap-1"
                                >
                                  📄 View Solution PDF
                                </a>
                              ) : (
                                <span className="text-slate-400 italic">No submission yet</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end text-xs text-gray-400 font-medium">
          Total Registered: {registrations.length} students
        </div>
      </div>
    </div>
  );
}
