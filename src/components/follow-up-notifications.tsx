import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { getActiveFollowUps, cancelFollowUp } from "@/lib/follow-ups";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

interface FollowUp {
  id: string;
  client_id: string;
  user_id: string;
  frequency: string;
  custom_interval_days: number | null;
  note: string | null;
  next_reminder: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function FollowUpNotifications() {
  const { u } = useAuth();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (u?.user?.id) {
      getActiveFollowUps(u.user.id).then(ups => {
        setFollowUps(ups);
      });
    }
  }, [u?.user?.id]);

  const handleCancel = async (id: string) => {
    await cancelFollowUp(id);
    setFollowUps(prev => prev.filter(f => f.id !== id));
    toast.success("Follow-up cancelled");
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {followUps.length > 0 && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
              {followUps.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-3">
          <h3 className="font-semibold">Pending Follow-ups</h3>
          {followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending follow-ups</p>
          ) : (
            <div className="space-y-2">
              {followUps.map(f => (
                <div key={f.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <p className="text-sm font-medium capitalize">{f.frequency.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      Next: {new Date(f.next_reminder).toLocaleDateString()}
                    </p>
                    {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleCancel(f.id)}>
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { FollowUpNotifications };
