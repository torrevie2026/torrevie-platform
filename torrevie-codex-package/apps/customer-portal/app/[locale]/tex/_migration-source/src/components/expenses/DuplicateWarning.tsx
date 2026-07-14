import { AlertTriangle } from 'lucide-react';
import type { DuplicateMatch } from '@/lib/duplicateDetection';

interface Props {
  match: DuplicateMatch | null;
  className?: string;
}

const DuplicateWarning = ({ match, className }: Props) => {
  if (!match) return null;
  return (
    <div
      role="alert"
      className={
        'flex items-start gap-2 text-sm bg-warning/10 border border-warning/30 text-warning-foreground rounded-md p-3 ' +
        (className || '')
      }
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
      <div className="flex-1">
        <div className="font-medium">Possible duplicate</div>
        <div className="text-muted-foreground">
          Matches {match.vendor} on {match.date} for {match.currency} {match.amount}
          {match.dayDiff === 0 ? ' (same day)' : ` (±${match.dayDiff} day${match.dayDiff === 1 ? '' : 's'})`}.
          You can still submit — it will be flagged for review.
        </div>
      </div>
    </div>
  );
};

export default DuplicateWarning;
