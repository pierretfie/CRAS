import { useDataScope } from "@/contexts/data-scope-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, User, Users, ChevronDown, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { query } from "@/lib/db";
import { cn } from "@/lib/utils";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

export function DataScopeToggle() {
  const { scope, setScope, isAdmin, currentUserId } = useDataScope();
  const { data: me } = useCurrentUser();
  const companyId = me?.company?.id;
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin && companyId) {
      setLoading(true);
      query(
        `SELECT p.id, p.name, u.email
         FROM profiles p
         JOIN auth.users u ON u.id = p.id
         WHERE p.company_id = $1
         ORDER BY p.name`,
        [companyId]
      )
        .then(({ data }) => setUsers((data as UserOption[]) || []))
        .finally(() => setLoading(false));
    }
  }, [isAdmin, companyId]);

  const isAllData = scope === "all";
  const isMine = scope === "mine";
  const selectedUser = !isMine && !isAllData ? users.find((u) => u.id === scope) : null;

  const label = isMine ? "Your Data" : isAllData ? "All Data" : selectedUser ? `${selectedUser.name}` : "Loading…";
  const Icon = isMine ? User : isAllData ? Users : Filter;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary",
            isAllData
              ? "border-amber-500/60 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              : isMine
              ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-purple-500/60 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">
          Viewing Data For
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Your Data */}
        <DropdownMenuItem
          onClick={() => setScope("mine")}
          className={cn("gap-3 py-2.5 cursor-pointer", isMine && "bg-primary/10")}
        >
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", isMine ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
            <User className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="font-medium leading-none">Your Data</p>
            <p className="text-xs text-muted-foreground mt-0.5">Clients you created &amp; engaged</p>
          </div>
          {isMine && <Check className="h-4 w-4 text-primary shrink-0" />}
        </DropdownMenuItem>

        {/* All Data - available to everyone */}
        <DropdownMenuItem
          onClick={() => setScope("all")}
          className={cn("gap-3 py-2.5 cursor-pointer", isAllData && "bg-amber-500/10")}
        >
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", isAllData ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground")}>
            <Users className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="font-medium leading-none">All Data</p>
            <p className="text-xs text-muted-foreground mt-0.5">Organization-wide view</p>
          </div>
          {isAllData && <Check className="h-4 w-4 text-amber-400 shrink-0" />}
        </DropdownMenuItem>

        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">
              Filter by Team Member
            </DropdownMenuLabel>

            {loading ? (
              <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                Loading users…
              </DropdownMenuItem>
            ) : (
              users.map((user) => {
                const isSelected = scope === user.id;
                return (
                  <DropdownMenuItem
                    key={user.id}
                    onClick={() => setScope(user.id)}
                    className={cn("gap-3 py-2 cursor-pointer", isSelected && "bg-purple-500/10")}
                  >
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      isSelected ? "bg-purple-500/20 text-purple-400" : "bg-muted text-muted-foreground"
                    )}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium leading-none truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{user.email}</p>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-purple-400 shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
