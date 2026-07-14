import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Demo = () => {
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        // Make sure no previous session bleeds into the demo
        await supabase.auth.signOut();
        const { data, error } = await supabase.functions.invoke("demo-login");
        if (error || !data?.token_hash) throw new Error(error?.message || "Could not start demo");
        const { error: vErr } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: "magiclink",
        });
        if (vErr) throw vErr;
        navigate("/dashboard", { replace: true });
      } catch (e) {
        toast.error((e as Error).message);
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Loading demo…</p>
    </div>
  );
};

export default Demo;
