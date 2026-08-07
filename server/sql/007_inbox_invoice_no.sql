-- Add searchable invoice_no (applied on production via inbox_add_invoice_no_and_indexes)
ALTER TABLE public.inbox_requests
  ADD COLUMN IF NOT EXISTS invoice_no TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_requests_user_invoice
  ON public.inbox_requests (user_id, invoice_no)
  WHERE invoice_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_requests_invoice_no
  ON public.inbox_requests (invoice_no);
