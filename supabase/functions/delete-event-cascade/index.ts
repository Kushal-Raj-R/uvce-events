import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { event_id } = await req.json()
    if (!event_id) {
      return new Response(JSON.stringify({ error: 'Missing event_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Initialize Supabase Client with service role key (to bypass RLS and delete files from buckets)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Get user identity from the user's token (verifying they are authenticated)
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user token: ' + userError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Fetch the event details to verify ownership
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single()

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: 'Event not found: ' + eventError?.message }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify ownership
    if (event.organizer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: You do not own this event' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`🧼 Service Role Purge initiated for Event ID: ${event_id} by Organizer: ${user.id}`);

    // Track files to delete grouped by bucket name
    const purgeQueue: Record<string, string[]> = {
      'event-materials': [],
      'event-attachment': [],
      'registration_files': [],
      'solutions': []
    }

    const parseSupabaseUrl = (url: string) => {
      if (!url || !url.includes('/storage/v1/object/public/')) return null
      try {
        const parts = url.split('/storage/v1/object/public/')[1]
        const firstSlashIndex = parts.indexOf('/')
        const bucketName = parts.substring(0, firstSlashIndex)
        const filePath = decodeURIComponent(parts.substring(firstSlashIndex + 1))
        return { bucketName, filePath }
      } catch {
        return null
      }
    }

    const enqueueUrl = (url: string) => {
      const info = parseSupabaseUrl(url)
      if (info && purgeQueue[info.bucketName]) {
        purgeQueue[info.bucketName].push(info.filePath)
      }
    }

    // A. Event banner URLs
    if (event.banner_path) enqueueUrl(event.banner_path)
    if (event.banner_url) enqueueUrl(event.banner_url)

    // B. Organizer PDF URL
    if (event.attachment_url) enqueueUrl(event.attachment_url)
    if (event.organizer_pdf_url) enqueueUrl(event.organizer_pdf_url)

    // C. Organizer Reference Documents (event.documents array)
    if (event.documents && Array.isArray(event.documents)) {
      event.documents.forEach((doc: any) => {
        if (doc && doc.url) enqueueUrl(doc.url)
      })
    }

    // D. Fetch all student registrations (custom_answers and solution_url)
    const { data: registrations, error: regError } = await supabaseAdmin
      .from('registrations')
      .select('custom_answers, solution_url')
      .eq('event_id', event_id)

    if (regError) {
      throw new Error('Failed to fetch registrations: ' + regError.message)
    }

    if (registrations && registrations.length > 0) {
      registrations.forEach((reg: any) => {
        // Enqueue custom answers URLs
        if (reg.custom_answers) {
          Object.values(reg.custom_answers).forEach((val: any) => {
            if (typeof val === 'string' && val.includes('/storage/v1/object/public/')) {
              enqueueUrl(val)
            }
          })
        }
        // Enqueue solution URLs
        if (reg.solution_url) {
          enqueueUrl(reg.solution_url)
        }
      })
    }

    // E. Older folder format directory listing in registration_files
    const { data: folderFiles } = await supabaseAdmin.storage
      .from('registration_files')
      .list(String(event_id))

    if (folderFiles && folderFiles.length > 0) {
      folderFiles.forEach((file: any) => {
        const filePath = `${event_id}/${file.name}`
        if (!purgeQueue['registration_files'].includes(filePath)) {
          purgeQueue['registration_files'].push(filePath)
        }
      })
    }

    // F. Execute removals and track failures
    const failedPurges: Record<string, string[]> = {}
    
    for (const bucketName of Object.keys(purgeQueue)) {
      const files = purgeQueue[bucketName]
      if (files.length > 0) {
        console.log(`🗑️ Edge Function removing files from bucket [${bucketName}]:`, files)
        const { error: storageError } = await supabaseAdmin.storage
          .from(bucketName)
          .remove(files)

        if (storageError) {
          console.error(`Error purging bucket [${bucketName}]:`, storageError.message)
          failedPurges[bucketName] = files
        }
      }
    }

    // G. Delete the database row
    const { error: dbDeleteError } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('id', event_id)

    if (dbDeleteError) {
      throw dbDeleteError
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Event and associated files successfully deleted',
        failedPurges: Object.keys(failedPurges).length > 0 ? failedPurges : null
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
