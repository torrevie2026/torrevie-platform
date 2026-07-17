import React from "react";
import { Link } from "react-router-dom";
import { useIsDemo } from "@/lib/demo";

const DemoBanner: React.FC = () => {
  const isDemo = useIsDemo();
  if (!isDemo) return null;
  return (
    <div className="w-full bg-amber-500/15 border-b border-amber-500/40 text-amber-900 dark:text-amber-100 px-4 py-2 text-xs md:text-sm flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span>
        <strong>Demo mode</strong> - you are exploring Torrevie TEX with sample data. Changes may be reset.
      </span>
      <Link to="/login" className="underline font-medium hover:text-amber-700 dark:hover:text-white">
        Create your own account
      </Link>
    </div>
  );
};

export default DemoBanner;
