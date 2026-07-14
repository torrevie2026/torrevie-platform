import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, MoveDown, MoveUp, Plus, Route, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Leg = {
  id?: string;
  sequence: number;
  origin: string;
  origin_place_id: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  origin_country: string | null;
  destination: string;
  destination_place_id: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_country: string | null;
  mode: string | null;
  container_ref: string | null;
  planned_start: string | null;
  planned_end: string | null;
  distance_km: number | null;
  is_return_trip: boolean;
  return_distance_km: number | null;
  return_duration_seconds: number | null;
  total_distance_km: number | null;
  duration_seconds: number | null;
  distance_source: string | null;
  route_polyline: string | null;
  budget: number | null;
  status: string;
  notes: string | null;
};

type PlaceSuggestion = {
  place_id: string;
  label: string;
  main_text: string;
  secondary_text: string;
};

type RouteEstimate = {
  distance_km: number;
  duration_seconds: number | null;
  route_polyline: string | null;
  source: string;
  is_return_trip?: boolean;
  return_distance_km?: number | null;
  return_duration_seconds?: number | null;
  total_distance_km?: number | null;
};

const STATUSES = ['planned', 'in_transit', 'completed', 'cancelled'];
const MODES = ['road', 'sea', 'air', 'rail'];

const empty = (seq: number): Leg => ({
  sequence: seq,
  origin: '',
  origin_place_id: null,
  origin_lat: null,
  origin_lng: null,
  origin_country: null,
  destination: '',
  destination_place_id: null,
  destination_lat: null,
  destination_lng: null,
  destination_country: null,
  mode: 'road',
  container_ref: null,
  planned_start: null,
  planned_end: null,
  distance_km: null,
  is_return_trip: false,
  return_distance_km: null,
  return_duration_seconds: null,
  total_distance_km: null,
  duration_seconds: null,
  distance_source: null,
  route_polyline: null,
  budget: null,
  status: 'planned',
  notes: null,
});

function dateInputValue(value: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function durationLabel(seconds: number | null) {
  if (!seconds || seconds <= 0) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (!hours) return `${minutes} min`;
  return `${hours}h ${minutes}m`;
}

function legTotalKm(leg: Pick<Leg, 'distance_km' | 'is_return_trip' | 'return_distance_km' | 'total_distance_km'>) {
  if (leg.total_distance_km != null) return leg.total_distance_km;
  if (leg.distance_km == null) return 0;
  return leg.is_return_trip ? leg.distance_km + (leg.return_distance_km ?? leg.distance_km) : leg.distance_km;
}

const PlaceSearchInput: React.FC<{
  label: string;
  value: string;
  placeId: string | null;
  companyId: string | null | undefined;
  placeholder: string;
  onChange: (value: string, placeId: string | null) => void;
}> = ({ label, value, placeId, companyId, placeholder, onChange }) => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId || value.trim().length < 3 || placeId) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiRequest<{ suggestions: PlaceSuggestion[] }>('/api/tex/maps/places/autocomplete', {
          method: 'POST',
          body: JSON.stringify({ company_id: companyId, input: value.trim() }),
        });
        if (!cancelled) {
          setSuggestions(data.suggestions ?? []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [companyId, value, placeId]);

  return (
    <div className="relative">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onChange={event => onChange(event.target.value, null)}
        placeholder={placeholder}
      />
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin absolute right-2.5 top-8 text-muted-foreground" />}
      {placeId && <p className="text-[11px] text-muted-foreground mt-1">Google place selected</p>}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {suggestions.slice(0, 6).map(suggestion => (
            <button
              key={suggestion.place_id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onChange(suggestion.label, suggestion.place_id);
                setSuggestions([]);
                setOpen(false);
              }}
            >
              <span className="block font-medium text-foreground">{suggestion.main_text || suggestion.label}</span>
              {suggestion.secondary_text && <span className="block text-xs text-muted-foreground">{suggestion.secondary_text}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TripLegsSheet: React.FC<{
  tripId: string;
  tripName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}> = ({ tripId, tripName, open, onOpenChange, onSaved }) => {
  const { selectedCompanyId } = useAuth();
  const [legs, setLegs] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [estimatingIndex, setEstimatingIndex] = useState<number | null>(null);

  const totalDistance = useMemo(
    () => legs.reduce((sum, leg) => sum + legTotalKm(leg), 0),
    [legs],
  );

  const fetchLegs = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ legs: Leg[] }>(`/api/tex/trips/${tripId}/legs`);
      setLegs(data.legs ?? []);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load trip legs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchLegs();
  }, [open, tripId]);

  const addLeg = () => setLegs(prev => [...prev, empty((prev[prev.length - 1]?.sequence ?? 0) + 1)]);

  const removeLeg = async (index: number) => {
    const leg = legs[index];
    if (leg.id) {
      try {
        await apiRequest(`/api/tex/trips/${tripId}/legs/${leg.id}`, { method: 'DELETE' });
      } catch (error) {
        toast.error((error as Error).message || 'Failed to delete leg');
        return;
      }
    }
    setLegs(prev => prev.filter((_, idx) => idx !== index).map((item, idx) => ({ ...item, sequence: idx + 1 })));
  };

  const update = (index: number, patch: Partial<Leg>) =>
    setLegs(prev => prev.map((leg, idx) => idx === index ? { ...leg, ...patch } : leg));

  const move = (index: number, direction: -1 | 1) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= legs.length) return;
    const next = [...legs];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setLegs(next.map((leg, idx) => ({ ...leg, sequence: idx + 1 })));
  };

  const estimateLeg = async (index: number) => {
    const leg = legs[index];
    if (!leg.origin.trim() || !leg.destination.trim()) {
      toast.error('Origin and destination are required before estimating');
      return;
    }
    if (leg.mode && leg.mode !== 'road') {
      toast.error('Google Maps route estimates are available for road legs');
      return;
    }
    setEstimatingIndex(index);
    try {
      const data = await apiRequest<{ estimate: RouteEstimate }>(`/api/tex/trips/${tripId}/legs/estimate`, {
        method: 'POST',
        body: JSON.stringify({
          origin: leg.origin,
          origin_place_id: leg.origin_place_id,
          destination: leg.destination,
          destination_place_id: leg.destination_place_id,
          return_to_origin: leg.is_return_trip,
        }),
      });
      update(index, {
        distance_km: data.estimate.distance_km,
        is_return_trip: data.estimate.is_return_trip === true,
        return_distance_km: data.estimate.return_distance_km ?? null,
        return_duration_seconds: data.estimate.return_duration_seconds ?? null,
        total_distance_km: data.estimate.total_distance_km ?? data.estimate.distance_km,
        duration_seconds: data.estimate.duration_seconds,
        distance_source: data.estimate.source,
        route_polyline: data.estimate.route_polyline,
        mode: 'road',
      });
      toast.success('Distance estimated');
    } catch (error) {
      toast.error((error as Error).message || 'Google Maps estimate failed');
    } finally {
      setEstimatingIndex(null);
    }
  };

  const saveAll = async () => {
    if (!selectedCompanyId) return;
    for (const leg of legs) {
      if (!leg.origin.trim() || !leg.destination.trim()) {
        toast.error('Every leg needs an origin and destination');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = legs.map((leg, idx) => ({
        ...leg,
        sequence: idx + 1,
        planned_start: dateInputValue(leg.planned_start) || null,
        planned_end: dateInputValue(leg.planned_end) || null,
      }));
      const data = await apiRequest<{ legs: Leg[] }>(`/api/tex/trips/${tripId}/legs`, {
        method: 'PUT',
        body: JSON.stringify({ company_id: selectedCompanyId, legs: payload }),
      });
      setLegs(data.legs ?? []);
      toast.success('Legs saved');
      onSaved?.();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save legs');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Legs - {tripName}</SheetTitle>
        </SheetHeader>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{legs.length} leg{legs.length === 1 ? '' : 's'}</Badge>
          {totalDistance > 0 && <Badge variant="outline">{totalDistance.toFixed(1)} km total</Badge>}
        </div>

        <div className="space-y-3 mt-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-6 text-sm">Loading...</p>
          ) : legs.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No legs yet. Add the first leg below.</p>
          ) : legs.map((leg, index) => (
            <Card key={leg.id ?? `new-${index}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">Leg {index + 1}</Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => move(index, -1)}><MoveUp className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === legs.length - 1} onClick={() => move(index, 1)}><MoveDown className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLeg(index)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <PlaceSearchInput
                    label="Start point *"
                    value={leg.origin}
                    placeId={leg.origin_place_id}
                    companyId={selectedCompanyId}
                    placeholder="Search Google Maps"
                    onChange={(value, placeId) => update(index, {
                      origin: value,
                      origin_place_id: placeId,
                      distance_source: placeId ? leg.distance_source : null,
                    })}
                  />
                  <PlaceSearchInput
                    label="End point *"
                    value={leg.destination}
                    placeId={leg.destination_place_id}
                    companyId={selectedCompanyId}
                    placeholder="Search Google Maps"
                    onChange={(value, placeId) => update(index, {
                      destination: value,
                      destination_place_id: placeId,
                      distance_source: placeId ? leg.distance_source : null,
                    })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Mode</Label>
                    <Select value={leg.mode ?? '__none__'} onValueChange={value => update(index, { mode: value === '__none__' ? null : value })}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {MODES.map(mode => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={leg.status} onValueChange={value => update(index, { status: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(status => <SelectItem key={status} value={status}>{status.replace('_', ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Container / BL</Label>
                    <Input value={leg.container_ref ?? ''} onChange={event => update(index, { container_ref: event.target.value || null })} placeholder="Optional" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Planned Start</Label>
                    <Input type="date" value={dateInputValue(leg.planned_start)} onChange={event => update(index, { planned_start: event.target.value || null })} />
                  </div>
                  <div>
                    <Label className="text-xs">Planned End</Label>
                    <Input type="date" value={dateInputValue(leg.planned_end)} onChange={event => update(index, { planned_end: event.target.value || null })} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Outbound distance (km)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={leg.distance_km ?? ''}
                      onChange={event => {
                        const value = event.target.value ? parseFloat(event.target.value) : null;
                        update(index, {
                          distance_km: value,
                          return_distance_km: leg.is_return_trip ? (leg.return_distance_km ?? value) : null,
                          total_distance_km: value == null ? null : leg.is_return_trip ? value + (leg.return_distance_km ?? value) : value,
                          distance_source: event.target.value ? 'manual' : null,
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Duration</Label>
                    <Input value={durationLabel(leg.duration_seconds)} disabled placeholder="Estimated" />
                  </div>
                  <Button type="button" variant="outline" onClick={() => estimateLeg(index)} disabled={estimatingIndex === index || !leg.origin.trim() || !leg.destination.trim()}>
                    {estimatingIndex === index ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Route className="h-4 w-4 mr-1" />}
                    Estimate
                  </Button>
                </div>

                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-xs">Return to origin</Label>
                      <p className="text-[11px] text-muted-foreground">Use one leg for port to warehouse and back to port.</p>
                    </div>
                    <Switch
                      checked={leg.is_return_trip}
                      onCheckedChange={checked => {
                        const outbound = leg.distance_km ?? null;
                        update(index, {
                          is_return_trip: checked,
                          return_distance_km: checked ? (leg.return_distance_km ?? outbound) : null,
                          return_duration_seconds: checked ? (leg.return_duration_seconds ?? leg.duration_seconds) : null,
                          total_distance_km: outbound == null ? null : checked ? outbound + (leg.return_distance_km ?? outbound) : outbound,
                          distance_source: leg.distance_source ? `${leg.distance_source}${checked && !leg.distance_source.includes('return') ? '_return' : ''}` : leg.distance_source,
                        });
                      }}
                    />
                  </div>
                  {(leg.distance_km != null || leg.return_distance_km != null) && (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Outbound</span>
                        <p className="font-medium">{(leg.distance_km ?? 0).toFixed(1)} km</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Return</span>
                        <p className="font-medium">{leg.is_return_trip ? (leg.return_distance_km ?? leg.distance_km ?? 0).toFixed(1) : '0.0'} km</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total</span>
                        <p className="font-medium">{legTotalKm(leg).toFixed(1)} km</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Budget</Label>
                    <Input type="number" min="0" value={leg.budget ?? ''} onChange={event => update(index, { budget: event.target.value ? parseFloat(event.target.value) : null })} />
                  </div>
                  <div>
                    <Label className="text-xs">Distance Source</Label>
                    <Input value={leg.distance_source ?? ''} disabled placeholder="Manual or Google Maps" />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea rows={2} value={leg.notes ?? ''} onChange={event => update(index, { notes: event.target.value || null })} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-2 mt-4 sticky bottom-0 bg-background pt-3 pb-1">
          <Button variant="outline" onClick={addLeg}><Plus className="h-4 w-4 mr-1" />Add leg</Button>
          <Button onClick={saveAll} disabled={saving || legs.length === 0} className="flex-1">
            <Save className="h-4 w-4 mr-1" />{saving ? 'Saving...' : 'Save all'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default TripLegsSheet;
