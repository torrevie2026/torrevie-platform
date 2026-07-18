update public.tex_unregistered_whatsapp_submissions
   set ocr_status = 'manual_review',
       ocr_error = coalesce(
         ocr_error,
         'TEX received the WhatsApp message, but no receipt image or PDF bytes were attached to the ingest request.'
       ),
       updated_at = now()
 where status = 'open'
   and message_type = 'receipt'
   and receipt_file_id is null
   and media_url is null
   and ocr_status in ('pending', 'processing');
