import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';

const MODES = [
  { value: 'auto', label: 'Auto-link', description: 'Automatically link receipts to the employee\'s active trip. If multiple trips, employees can select via WhatsApp.' },
  { value: 'employee_select', label: 'Employee selects', description: 'Employees must send TRIP <name> via WhatsApp before submitting receipts.' },
  { value: 'manual', label: 'Admin assigns manually', description: 'Receipts are never auto-linked. Admins assign trips manually from the Expenses page.' },
];

const TripLinkingSection = () => {
  const { selectedCompanyId } = useAuth();
  const [mode, setMode] = useState('auto');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase.from('companies').select('trip_linking_mode').eq('id', selectedCompanyId).single()
      .then(({ data }) => {
        if (data?.trip_linking_mode) setMode(data.trip_linking_mode);
        setLoading(false);
      });
  }, [selectedCompanyId]);

  const handleChange = async (value: string) => {
    setMode(value);
    const { error } = await supabase.from('companies').update({ trip_linking_mode: value } as any).eq('id', selectedCompanyId!);
    if (error) { toast.error(error.message); return; }
    toast.success('Trip linking preference updated');
  };

  if (loading) return null;

  const selected = MODES.find(m => m.value === mode);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" /> WhatsApp Trip Linking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-sm">How should WhatsApp receipts be linked to trips?</Label>
          <Select value={mode} onValueChange={handleChange}>
            <SelectTrigger className="mt-1.5 w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selected && (
          <p className="text-xs text-muted-foreground">{selected.description}</p>
        )}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
          <p className="font-medium text-foreground">WhatsApp commands for employees:</p>
          <p><code className="text-primary">TRIP</code> — List active trips</p>
          <p><code className="text-primary">TRIP &lt;name&gt;</code> — Set active trip for future receipts</p>
          <p><code className="text-primary">TRIP STOP</code> — Clear trip preference</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TripLinkingSection;
