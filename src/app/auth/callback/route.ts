import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const { session } = data
      const providerToken = session.provider_token
      const providerRefreshToken = session.provider_refresh_token

      // Save Google OAuth tokens to google_accounts for Calendar access
      if (providerToken && providerRefreshToken) {
        const admin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        await admin.from('google_accounts').upsert(
          {
            user_id: session.user.id,
            email: session.user.email ?? '',
            access_token: providerToken,
            refresh_token: providerRefreshToken,
            token_expiry: new Date(
              (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000
            ).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
