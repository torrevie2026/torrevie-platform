import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { format } from 'date-fns';
import { MapPin, Plus, CalendarDays, Pencil, XCircle, Lock, Users2, Route, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import TripLegsSheet from '@/components/trips/TripLegsSheet';
import ReceiptUpload from '@/components/ReceiptUpload';

type Trip = {
  id: string; name: string; description: string | null; start_date: string | null;
  end_date: string | null; budget_aed: number | null; status: string | null;
  advance_deposit_slip_url: string | null; advance_deposit_slip_file_id: string | null;
  created_by: string | null; company_id: string; created_at: string | null;
  enforce_currency: boolean | null; enforced_currency: string | null; team_id: string | null;
  trip_type: string | null; origin: string | null; destination: string | null;
  container_number: string | null; driver_employee_id: string | null; driver_name?: string | null;
  driver_trip_amount: number | null; subcontractor_driver_name: string | null;
  subcontractor_amount: number | null; subcontractor_notes: string | null;
  driver_payout_status: string | null; driver_payout_paid_at: string | null;
};

type TripWithStats = Trip & { expenseCount: number; totalSpend: number; teamName: string | null; legCount: number };
type Team = { id: string; name: string };
type Employee = { id: string; name: string; phone_number: string | null; department: string | null };

const statusStyle = (s: string | null) => {
  if (s === 'open') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'closed') return 'bg-muted text-muted-foreground border-border';
  return 'bg-muted/50 text-muted-foreground/60 border-border/50';
};

const receiptIdFromUrl = (url: string | null | undefined) =>
  String(url || '').match(/\/api\/tex\/receipts\/([0-9a-f-]+)/i)?.[1] || '';

const Trips = () => {
  const { user, profile, selectedCompanyId, companies } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'coordinator' || profile?.super_admin;

  const [trips, setTrips] = useState<TripWithStats[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseCurrency, setBaseCurrency] = useState('AED');
  const [showForm, setShowForm] = useState(false);
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [closeTrip, setCloseTrip] = useState<Trip | null>(null);
  const [deleteTrip, setDeleteTrip] = useState<TripWithStats | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStart, setFormStart] = useState<Date | undefined>();
  const [formEnd, setFormEnd] = useState<Date | undefined>();
  const [formBudget, setFormBudget] = useState('');
  const [formAdvanceSlipUrl, setFormAdvanceSlipUrl] = useState('');
  const [formAdvanceSlipFileId, setFormAdvanceSlipFileId] = useState('');
  const [formEnforceCurrency, setFormEnforceCurrency] = useState(false);
  const [formTeamId, setFormTeamId] = useState('none');
  const [formTripType, setFormTripType] = useState<'general' | 'logistics'>('general');
  const [formOrigin, setFormOrigin] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formContainerNumber, setFormContainerNumber] = useState('');
  const [formDriverEmployeeId, setFormDriverEmployeeId] = useState('none');
  const [formDriverTripAmount, setFormDriverTripAmount] = useState('');
  const [formSubcontractorName, setFormSubcontractorName] = useState('');
  const [formSubcontractorAmount, setFormSubcontractorAmount] = useState('');
  const [formSubcontractorNotes, setFormSubcontractorNotes] = useState('');
  const [legsForTrip, setLegsForTrip] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedCompany = companies?.find((company) => company.id === selectedCompanyId);
  const companyCurrency = selectedCompany?.base_currency || baseCurrency || 'AED';

  const resetForm = () => {
    setFormName(''); setFormDesc(''); setFormStart(undefined); setFormEnd(undefined);
    setFormBudget(''); setFormAdvanceSlipUrl(''); setFormAdvanceSlipFileId(''); setFormEnforceCurrency(false);
    setFormTeamId('none'); setFormTripType('general'); setFormOrigin(''); setFormDestination('');
    setFormContainerNumber('');
    setFormDriverEmployeeId('none'); setFormDriverTripAmount('');
    setFormSubcontractorName(''); setFormSubcontractorAmount(''); setFormSubcontractorNotes('');
    setEditTrip(null);
  };

  const fetchTrips = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    try {
      const data = await apiRequest<{
        company: { base_currency: string } | null;
        teams: Team[];
        employees: Employee[];
        trips: Array<Trip & { expense_count: number; total_spend: number; team_name: string | null; leg_count: number }>;
      }>(`/api/tex/trips?company_id=${encodeURIComponent(selectedCompanyId)}`);
      setBaseCurrency(data.company?.base_currency || selectedCompany?.base_currency || 'AED');
      setTeams(data.teams ?? []);
      setEmployees(data.employees ?? []);
      setTrips((data.trips ?? []).map((trip) => ({
        ...trip,
        expenseCount: trip.expense_count ?? 0,
        totalSpend: trip.total_spend ?? 0,
        teamName: trip.team_name ?? null,
        legCount: trip.leg_count ?? 0,
      })));
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrips(); }, [selectedCompanyId]);

  const openEdit = (trip: Trip) => {
    setEditTrip(trip);
    setFormName(trip.name);
    setFormDesc(trip.description ?? '');
    setFormStart(trip.start_date ? new Date(trip.start_date) : undefined);
    setFormEnd(trip.end_date ? new Date(trip.end_date) : undefined);
    setFormBudget(trip.budget_aed?.toString() ?? '');
    setFormAdvanceSlipUrl(trip.advance_deposit_slip_url ?? '');
    setFormAdvanceSlipFileId(trip.advance_deposit_slip_file_id ?? receiptIdFromUrl(trip.advance_deposit_slip_url));
    setFormEnforceCurrency(trip.enforce_currency ?? false);
    setFormTeamId(trip.team_id ?? 'none');
    setFormTripType((trip.trip_type === 'logistics' ? 'logistics' : 'general'));
    setFormOrigin(trip.origin ?? '');
    setFormDestination(trip.destination ?? '');
    setFormContainerNumber(trip.container_number ?? '');
    setFormDriverEmployeeId(trip.driver_employee_id ?? 'none');
    setFormDriverTripAmount(trip.driver_trip_amount != null && trip.driver_trip_amount > 0 ? String(trip.driver_trip_amount) : '');
    setFormSubcontractorName(trip.subcontractor_driver_name ?? '');
    setFormSubcontractorAmount(trip.subcontractor_amount != null && trip.subcontractor_amount > 0 ? String(trip.subcontractor_amount) : '');
    setFormSubcontractorNotes(trip.subcontractor_notes ?? '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !selectedCompanyId || !user) return;
    if (!formOrigin.trim() || !formDestination.trim()) {
      toast.error('Origin and destination are required');
      return;
    }
    setSaving(true);
    const payload: any = {
      name: formName.trim(),
      description: formDesc.trim() || null,
      start_date: formStart ? format(formStart, 'yyyy-MM-dd') : null,
      end_date: formEnd ? format(formEnd, 'yyyy-MM-dd') : null,
      budget_aed: formBudget ? parseFloat(formBudget) : null,
      advance_deposit_slip_url: formBudget ? (formAdvanceSlipUrl || null) : null,
      advance_deposit_slip_file_id: formBudget ? (formAdvanceSlipFileId || receiptIdFromUrl(formAdvanceSlipUrl) || null) : null,
      company_id: selectedCompanyId,
      enforce_currency: formEnforceCurrency,
      enforced_currency: formEnforceCurrency ? companyCurrency : null,
      team_id: formTeamId !== 'none' ? formTeamId : null,
      trip_type: formTripType,
      origin: formOrigin.trim() || null,
      destination: formDestination.trim() || null,
      container_number: formContainerNumber.trim() || null,
      driver_employee_id: formDriverEmployeeId !== 'none' ? formDriverEmployeeId : null,
      driver_trip_amount: formDriverTripAmount ? parseFloat(formDriverTripAmount) : 0,
      subcontractor_driver_name: formSubcontractorName.trim() || null,
      subcontractor_amount: formSubcontractorAmount ? parseFloat(formSubcontractorAmount) : 0,
      subcontractor_notes: formSubcontractorNotes.trim() || null,
      ...(editTrip ? {} : { created_by: user.id, status: 'open' }),
    };
    try {
      if (editTrip) {
        await apiRequest<{ trip: Trip }>(`/api/tex/trips/${editTrip.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest<{ trip: Trip }>('/api/tex/trips', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      toast.success(editTrip ? 'Trip updated' : 'Trip created');
      setShowForm(false); resetForm(); fetchTrips();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save trip');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!closeTrip || !user || !selectedCompanyId) return;
    try {
      await apiRequest(`/api/tex/trips/${closeTrip.id}/close`, { method: 'PATCH' });
      toast.success('Trip closed');
      setCloseTrip(null); fetchTrips();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to close trip');
    }
  };

  const handleDelete = async () => {
    if (!deleteTrip) return;
    try {
      const data = await apiRequest<{ deleted: { expense_count: number; trip_budget_advance: number } }>(`/api/tex/trips/${deleteTrip.id}`, { method: 'DELETE' });
      toast.success(`Trip deleted. Removed ${data.deleted.expense_count} expense${data.deleted.expense_count === 1 ? '' : 's'}.`);
      setDeleteTrip(null);
      fetchTrips();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to delete trip');
    }
  };

  const openTrips = trips.filter(t => t.status === 'open');
  const closedTrips = trips.filter(t => t.status !== 'open');

  const TripCard: React.FC<{ trip: TripWithStats }> = ({ trip }) => {
    const pct = trip.budget_aed && trip.budget_aed > 0 ? (trip.totalSpend / trip.budget_aed) * 100 : 0;
    const barColor = pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-amber-500' : 'bg-green-500';
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-semibold text-foreground">{trip.name}</h3>
              {trip.description && <p className="text-xs text-muted-foreground mt-0.5">{trip.description}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              {trip.enforce_currency && (
                <Badge variant="outline" className="text-[10px] gap-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800">
                  <Lock className="h-2.5 w-2.5" />{trip.enforced_currency}
                </Badge>
              )}
              {trip.trip_type === 'logistics' && (
                <Badge variant="outline" className="text-[10px] gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800">
                  <Route className="h-2.5 w-2.5" />Logistics
                </Badge>
              )}
              <Badge variant="outline" className={cn('capitalize text-xs', statusStyle(trip.status))}>{trip.status ?? 'open'}</Badge>
            </div>
          </div>
          {(trip.origin || trip.destination) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <MapPin className="h-3.5 w-3.5" />
              {trip.origin ?? '-'} {' to '} {trip.destination ?? '-'}
            </div>
          )}
          {trip.container_number && (
            <div className="text-xs text-muted-foreground mb-2">
              <span className="font-medium">Container:</span> {trip.container_number}
            </div>
          )}
          {(trip.driver_name || (trip.driver_trip_amount ?? 0) > 0 || (trip.subcontractor_amount ?? 0) > 0) && (
            <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
              {trip.driver_name && <p><span className="font-medium">Driver:</span> {trip.driver_name}</p>}
              {(trip.driver_trip_amount ?? 0) > 0 && (
                <p><span className="font-medium">Driver trip amount:</span> {companyCurrency} {(trip.driver_trip_amount ?? 0).toFixed(2)}</p>
              )}
              {(trip.subcontractor_amount ?? 0) > 0 && (
                <p><span className="font-medium">Subcontracted driver:</span> {trip.subcontractor_driver_name || 'External'} - {companyCurrency} {(trip.subcontractor_amount ?? 0).toFixed(2)}</p>
              )}
              {((trip.driver_trip_amount ?? 0) > 0 || (trip.subcontractor_amount ?? 0) > 0) && (
                <Badge variant="outline" className="text-[10px] capitalize">{trip.driver_payout_status ?? 'unpaid'}</Badge>
              )}
            </div>
          )}
          {trip.teamName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <Users2 className="h-3.5 w-3.5" />Team: {trip.teamName}
            </div>
          )}
          {(trip.start_date || trip.end_date) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <CalendarDays className="h-3.5 w-3.5" />
              {trip.start_date && format(new Date(trip.start_date), 'dd MMM yyyy')}
              {trip.start_date && trip.end_date && ' - '}
              {trip.end_date && format(new Date(trip.end_date), 'dd MMM yyyy')}
            </div>
          )}
          {trip.budget_aed != null && (
            <>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Spend vs advance: {trip.totalSpend.toFixed(0)} / {trip.budget_aed.toFixed(0)} {companyCurrency}</span>
                <span className="font-medium text-foreground">{pct.toFixed(0)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              {trip.advance_deposit_slip_url && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-8 gap-1.5"
                  onClick={() => window.open(trip.advance_deposit_slip_url!, '_blank', 'noopener,noreferrer')}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Deposit slip
                </Button>
              )}
            </>
          )}
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <span className="text-xs text-muted-foreground">
              {trip.expenseCount} expense{trip.expenseCount !== 1 ? 's' : ''}
              {trip.trip_type === 'logistics' && ` · ${trip.legCount} leg${trip.legCount !== 1 ? 's' : ''}`}
            </span>
            <div className="flex gap-1">
              {trip.trip_type === 'logistics' && (
                <Button variant="outline" size="sm" onClick={() => setLegsForTrip({ id: trip.id, name: trip.name })}>
                  <Route className="h-3.5 w-3.5 mr-1" />Legs
                </Button>
              )}
              <Button variant="outline" size="sm" asChild><Link to={`/expenses?trip=${trip.id}`}>View expenses</Link></Button>
              {isAdmin && trip.status === 'open' && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(trip)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setCloseTrip(trip)}><XCircle className="h-3.5 w-3.5" /></Button>
                </>
              )}
              {isAdmin && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTrip(trip)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Trips</h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" />New Trip</Button>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-10">Loading...</p>
      ) : openTrips.length === 0 && closedTrips.length === 0 ? (
        <div className="bg-card rounded-lg shadow-sm border p-8 text-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">No trips yet</h2>
          <p className="text-sm text-muted-foreground">Create trips to group related expenses together.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {openTrips.map(t => <TripCard key={t.id} trip={t} />)}
          </div>
          {closedTrips.length > 0 && (
            <Collapsible open={closedOpen} onOpenChange={setClosedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="text-muted-foreground mb-2">
                  {closedOpen ? 'v' : '>'} Closed Trips ({closedTrips.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75">
                  {closedTrips.map(t => <TripCard key={t.id} trip={t} />)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      {/* New / Edit Trip Sheet */}
      <Sheet open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); resetForm(); } }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{editTrip ? 'Edit Trip' : 'New Trip'}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Trip Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Dubai Sales Conference" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optional description" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !formStart && 'text-muted-foreground')}>
                      {formStart ? format(formStart, 'dd MMM yyyy') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formStart} onSelect={setFormStart} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !formEnd && 'text-muted-foreground')}>
                      {formEnd ? format(formEnd, 'dd MMM yyyy') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formEnd} onSelect={setFormEnd} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div>
              <Label>Paid Advance / Trip Budget ({companyCurrency})</Label>
              <Input type="text" inputMode="decimal" value={formBudget} onChange={e => setFormBudget(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Optional" />
              <p className="text-xs text-muted-foreground mt-1">This amount is treated as a paid driver advance in Finance Review.</p>
            </div>
            {formBudget && selectedCompanyId && (
              <div>
                <Label>Deposit Slip</Label>
                <ReceiptUpload
                  companyId={selectedCompanyId}
                  uploadedUrl={formAdvanceSlipUrl || null}
                  onUploadComplete={(url) => {
                    setFormAdvanceSlipUrl(url);
                    setFormAdvanceSlipFileId(receiptIdFromUrl(url));
                  }}
                  onFileReady={() => {}}
                />
                <p className="text-xs text-muted-foreground mt-1">Attach the bank deposit or cash handover slip for this paid advance.</p>
              </div>
            )}

            {/* Currency enforcement */}
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Enforce a single currency</Label>
                <Switch checked={formEnforceCurrency} onCheckedChange={setFormEnforceCurrency} />
              </div>
              {formEnforceCurrency && (
                <>
                  <Input value={companyCurrency} disabled className="bg-muted" />
                  <p className="text-xs text-muted-foreground">
                    All team members must submit expenses in {companyCurrency} for this trip. Receipts in other currencies will be flagged for conversion.
                  </p>
                </>
              )}
            </div>

            {/* Assign to team */}
            <div>
              <Label>Assign to Team</Label>
              <Select value={formTeamId} onValueChange={setFormTeamId}>
                <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No team</SelectItem>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Trip type */}
            <div>
              <Label>Trip Type</Label>
              <Select value={formTripType} onValueChange={v => setFormTripType(v as 'general' | 'logistics')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General (employee travel)</SelectItem>
                  <SelectItem value="logistics">Logistics (container / delivery with legs)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Logistics trips unlock multi-stop legs (origin to stops to destination) for drivers.
              </p>
            </div>

            {/* Origin / Destination */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Origin <span className="text-destructive">*</span></Label>
                <Input value={formOrigin} onChange={e => setFormOrigin(e.target.value)} placeholder="e.g. Jebel Ali Port" required />
              </div>
              <div>
                <Label>Destination <span className="text-destructive">*</span></Label>
                <Input value={formDestination} onChange={e => setFormDestination(e.target.value)} placeholder="e.g. Riyadh DC" required />
              </div>
            </div>

            <div>
              <Label>Container Number</Label>
              <Input value={formContainerNumber} onChange={e => setFormContainerNumber(e.target.value)} placeholder="e.g. MSKU1234567" />
              <p className="text-xs text-muted-foreground mt-1">Primary container / shipment reference for this trip.</p>
            </div>

            <div className="space-y-3 p-3 bg-muted/50 rounded-lg border border-border">
              <div>
                <Label>Driver in Charge</Label>
                <Select value={formDriverEmployeeId} onValueChange={setFormDriverEmployeeId}>
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No driver assigned</SelectItem>
                    {employees.map(employee => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}{employee.department ? ` (${employee.department})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Driver Trip Amount ({companyCurrency})</Label>
                <Input type="text" inputMode="decimal" value={formDriverTripAmount} onChange={e => setFormDriverTripAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" />
                <p className="text-xs text-muted-foreground mt-1">This amount is added to the driver's finance settlement for this trip.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>External Driver</Label>
                  <Input value={formSubcontractorName} onChange={e => setFormSubcontractorName(e.target.value)} placeholder="Optional name" />
                </div>
                <div>
                  <Label>External Driver Amount ({companyCurrency})</Label>
                  <Input type="text" inputMode="decimal" value={formSubcontractorAmount} onChange={e => setFormSubcontractorAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" />
                </div>
              </div>
              <div>
                <Label>External Driver Notes</Label>
                <Textarea value={formSubcontractorNotes} onChange={e => setFormSubcontractorNotes(e.target.value)} placeholder="Optional subcontractor payout details" rows={2} />
                <p className="text-xs text-muted-foreground mt-1">The subcontractor amount is paid to the driver in charge, who pays the external driver.</p>
              </div>
            </div>


            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={!formName.trim() || !formOrigin.trim() || !formDestination.trim() || saving}>
                {saving ? 'Saving...' : editTrip ? 'Update' : 'Create Trip'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Close trip confirmation */}
      <AlertDialog open={!!closeTrip} onOpenChange={open => { if (!open) setCloseTrip(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close trip "{closeTrip?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Closed trips can no longer have new expenses added. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClose}>Close Trip</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete trip confirmation */}
      <AlertDialog open={!!deleteTrip} onOpenChange={open => { if (!open) setDeleteTrip(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete trip "{deleteTrip?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the trip, its legs, {deleteTrip?.expenseCount ?? 0} linked expense{(deleteTrip?.expenseCount ?? 0) === 1 ? '' : 's'}, and the trip budget advance of {companyCurrency} {(deleteTrip?.budget_aed ?? 0).toFixed(2)}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Delete Trip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {legsForTrip && (
        <TripLegsSheet
          tripId={legsForTrip.id}
          tripName={legsForTrip.name}
          open={!!legsForTrip}
          onOpenChange={open => { if (!open) { setLegsForTrip(null); fetchTrips(); } }}
          onSaved={fetchTrips}
        />
      )}
    </div>
  );
};

export default Trips;
