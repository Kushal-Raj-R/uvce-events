# Tasks: Multi-Day Event Timeline & Deadlines

- [x] Task 1: Update Supabase schema definition in `schema.sql` to drop `max_file_size_mb` and add timeline columns (`registration_deadline`, `event_start_date`, `duration_days`)
- [x] Task 2: Refactor `supabaseClient.js` default mock events and database migration scripts to inject and clean up timeline columns
- [x] Task 3: Refactor `OrganizerDashboard.jsx` to replace max file size inputs with a beautiful Event Timeline Configuration grid block, mapping states, and resetting values
- [x] Task 4: Refactor `StudentDashboard.jsx` student portal registrations tab view to display the styled timeline badge section
- [x] Task 5: Verify static analysis using `npm.cmd run lint` and build compilation using `npm.cmd run build`
- [x] Task 6: Rename old "DATE" input to "REGISTRATION DEADLINE", map `registration_deadline`, and clean up duplicate bottom deadline inputs into a 2-column event timeline layout
- [x] Task 7: Replace banner image URL input with a local image file uploader (`handleBannerUpload`) that uploads files to Supabase/Mock storage and displays a premium preview block
- [x] Task 8: Update Supabase schema to utilize `TIMESTAMPTZ` for timeline inputs, change fields to `datetime-local`, and format values dynamically using a custom date-time formatter in the student registrations view
- [x] Task 9: Rename database column `banner_url` to `banner_path` in schema configuration, mock events, organizer event launch payload, and student cards rendering
- [x] Task 10: Completely delete the old `date` column reference from Supabase schema, default seeds, and event creation payloads, and shift card/registrations date displays to use `event_start_date`
- [x] Task 11: Implement error boundary for timeline component rendering
- [x] Task 12: Enforce normalized string comparisons for event registration checks and implement a post-close fetch timeout hook in StudentDashboard.jsx
- [x] Task 13: Enrich connections profile state query and render monogram card widgets in StudentDashboard.jsx
- [x] Task 14: Add MCQ 'Allow Multiple' toggle configuration support and dynamically render checkboxes or dropdown select menus in Student Registration modal
- [x] Task 15: Create "Event Materials" sidebar navigation option for Organizers and implement dynamic materials management panel view with Supabase Storage file uploads
- [x] Task 16: Implement expandable accordion drawer pattern in Student registrations tab list to show organizer notice announcements and material PDFs
- [x] Task 17: Implement PDF solution file uploads inside the student dashboard registrations drawer and display them in the organizer participant list modal and CSV export
