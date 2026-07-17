import { supabase } from '@/integrations/supabase/client';
import {
  getAllQueued,
  updateQueueItem,
  removeFromQueue,
  type OfflineExpense,
} from './offlineQueue';
import { findDuplicateExpense, mergeDuplicateIntoPolicy } from './duplicateDetection';

const MAX_RETRIES = 3;

export type SyncResult = {
  synced: number;
  failed: number;
};

export async function syncOfflineExpenses(): Promise<SyncResult> {
  const items = await getAllQueued();
  const pending = items.filter(i => i.sync_status === 'pending' || i.sync_status === 'failed');

  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    if (!item.id) continue;
    if (item.retry_count >= MAX_RETRIES && item.sync_status === 'failed') {
      failed++;
      continue;
    }

    try {
      await updateQueueItem(item.id, { sync_status: 'syncing' });

      let receiptUrl: string | null = null;

      // 1. Upload receipt if exists
      if (item.receipt_image_base64 && item.expense_data.company_id) {
        try {
          const byteString = atob(item.receipt_image_base64);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const blob = new Blob([ab], { type: 'image/jpeg' });

          const now = new Date();
          const path = `${item.expense_data.company_id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getTime()}_${item.receipt_filename || 'receipt.jpg'}`;

          const { error: uploadErr } = await supabase.storage
            .from('receipts')
            .upload(path, blob, { upsert: false });

          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
            receiptUrl = urlData.publicUrl;
          }
        } catch (uploadErr) {
          console.error('Receipt upload failed during sync:', uploadErr);
        }
      }

      // 2. Try AI parsing if we have an image
      let parsedData: Record<string, any> | null = null;
      if (item.receipt_image_base64) {
        try {
          const { data, error } = await supabase.functions.invoke('parse-receipt', {
            body: {
              image_base64: item.receipt_image_base64,
              media_type: 'image/jpeg',
              country_code: item.expense_data._country_code || '',
            },
          });
          if (!error && data && !data.error) {
            parsedData = data;
          }
        } catch {
          // AI parsing failed — continue with manual data
        }
      }

      // 3. Merge: manual entry takes priority
      const expenseData = { ...item.expense_data };
      delete expenseData._country_code; // internal field

      if (parsedData) {
        // Only fill in empty fields from AI
        if (!expenseData.vendor && parsedData.vendor) expenseData.vendor = parsedData.vendor;
        if (!expenseData.category && parsedData.category) expenseData.category = parsedData.category;
        if (!expenseData.payment_method && parsedData.payment_method) expenseData.payment_method = parsedData.payment_method;
        if (!expenseData.notes && parsedData.notes) expenseData.notes = parsedData.notes;
        if (!expenseData.tax_id_number && parsedData.tax_id_number) expenseData.tax_id_number = parsedData.tax_id_number;
        if (expenseData.tax_amount == null && parsedData.tax_amount != null) expenseData.tax_amount = parsedData.tax_amount;
      }

      if (receiptUrl) {
        expenseData.receipt_image_url = receiptUrl;
      }

      // 4. Duplicate detection (re-check at sync time against latest server state)
      let policyFlag = expenseData.policy_flag || false;
      let policyFlagReason: string | null = expenseData.policy_flag_reason || null;
      try {
        const dupMatch = await findDuplicateExpense({
          company_id: expenseData.company_id,
          employee_id: expenseData.employee_id || null,
          employee_name: expenseData.employee_name || null,
          vendor: expenseData.vendor || null,
          amount: expenseData.amount,
          currency: expenseData.currency,
          date: expenseData.date,
        });
        const merged = mergeDuplicateIntoPolicy(
          { policy_flag: policyFlag, policy_flag_reason: policyFlagReason },
          dupMatch,
        );
        policyFlag = merged.policy_flag;
        policyFlagReason = merged.policy_flag_reason;
      } catch (dupErr) {
        console.error('Duplicate detection failed during sync:', dupErr);
      }

      // 5. Save to Supabase
      const insertPayload = {
        company_id: expenseData.company_id,
        vendor: expenseData.vendor || null,
        date: expenseData.date,
        amount: expenseData.amount,
        currency: expenseData.currency,
        base_amount: expenseData.base_amount || null,
        exchange_rate: expenseData.exchange_rate || null,
        category: expenseData.category || null,
        payment_method: expenseData.payment_method || null,
        trip_id: expenseData.trip_id || null,
        trip_name: expenseData.trip_name || null,
        employee_id: expenseData.employee_id || null,
        employee_name: expenseData.employee_name || null,
        employee_phone: expenseData.employee_phone || null,
        notes: expenseData.notes || null,
        tax_id_number: expenseData.tax_id_number || null,
        tax_amount: expenseData.tax_amount || null,
        receipt_image_url: expenseData.receipt_image_url || null,
        status: expenseData.status || 'pending',
        source: expenseData.source || 'web',
        policy_flag: policyFlag,
        policy_flag_reason: policyFlagReason,
      };
      const { data: newExpense, error: insertErr } = await supabase
        .from('expenses')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      // 5. Audit log
      if (newExpense) {
        await supabase.from('audit_log').insert({
          company_id: expenseData.company_id,
          user_id: expenseData._user_id || null,
          action: 'create',
          table_name: 'expenses',
          record_id: newExpense.id,
          new_values: { source: 'offline_sync' } as any,
        });
      }

      // 6. Success — remove from queue
      await removeFromQueue(item.id);
      synced++;
    } catch (err) {
      console.error('Sync failed for item', item.id, err);
      await updateQueueItem(item.id, {
        sync_status: 'failed',
        retry_count: (item.retry_count || 0) + 1,
      });
      failed++;
    }
  }

  return { synced, failed };
}
