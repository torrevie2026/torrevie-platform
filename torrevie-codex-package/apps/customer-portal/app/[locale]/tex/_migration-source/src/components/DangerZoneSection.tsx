import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const DangerZoneSection: React.FC = () => {
  const { user, selectedCompanyId } = useAuth();
  const [showFirst, setShowFirst] = useState(false);
  const [showSecond, setShowSecond] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleFirstConfirm = () => {
    setShowFirst(false);
    setShowSecond(true);
    setConfirmText('');
  };

  const handleDelete = async () => {
    if (confirmText !== 'DELETE ALL EXPENSES' || !selectedCompanyId) return;
    setDeleting(true);

    // Audit log first
    await supabase.from('audit_log').insert({
      company_id: selectedCompanyId, user_id: user?.id, action: 'delete',
      table_name: 'expenses', new_values: { action: 'clear_all_expenses' } as any,
    });

    const { error } = await supabase.from('expenses').delete().eq('company_id', selectedCompanyId);
    if (error) toast.error('Failed: ' + error.message);
    else toast.success('All expenses have been deleted');

    setDeleting(false);
    setShowSecond(false);
    setConfirmText('');
  };

  return (
    <div className="bg-card rounded-lg border border-destructive/30 p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">These actions are irreversible. Proceed with caution.</p>
      <Button variant="destructive" onClick={() => setShowFirst(true)}>
        Clear All Expenses
      </Button>

      <AlertDialog open={showFirst} onOpenChange={setShowFirst}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all expenses for your company. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFirstConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSecond} onOpenChange={setShowSecond}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Final Confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              Type <strong>DELETE ALL EXPENSES</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="DELETE ALL EXPENSES" className="my-2" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE ALL EXPENSES' || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete Everything'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DangerZoneSection;
