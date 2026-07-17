import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <img src="/torrevie-logo.png" alt="Torrevie" className="mx-auto mb-6 h-14 w-auto" />
        <h1 className="mb-3 text-4xl font-bold text-foreground">Torrevie TEX</h1>
        <p className="mb-6 text-muted-foreground">
          Expense control, travel operations, approvals, finance review, and reporting in one Torrevie workspace.
        </p>
        <Button asChild>
          <Link to="/dashboard">Open workspace</Link>
        </Button>
      </div>
    </div>
  );
};

export default Index;
