# Supabase setup for Google Calendar

These Edge Functions need secrets and the latest schema before Google Calendar will connect successfully:

1) Set secrets in your Supabase project (Dashboard → Edge Functions → Secrets or CLI):
```
supabase secrets set \
  SERVICE_ROLE_KEY=<your service role key> \
  SUPABASE_URL=<your project url> \
  SUPABASE_ANON_KEY=<your anon key> \
  GOOGLE_CLIENT_ID=<your OAuth client id> \
  GOOGLE_CLIENT_SECRET=<your OAuth client secret> \
  GOOGLE_TOKEN_ENCRYPTION_KEY=<any random string>
```
`SERVICE_ROLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are both accepted; use one of them.

2) Run migrations so the `google_calendar_connections` columns exist:
```
supabase db push
```

3) Deploy the functions:
```
supabase functions deploy google-calendar-connect
supabase functions deploy google-calendar-oauth-callback
supabase functions deploy google-calendar-events
supabase functions deploy google-calendar-webhook
```

After these steps, the UI’s Connect/Disconnect buttons should reflect the real status.
