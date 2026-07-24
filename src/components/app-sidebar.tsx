import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Users, BarChart3, MessageSquareText, Shield, PlusCircle, Bell, BookOpen, Info, UserCircle, CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCurrentUser } from "@/hooks/use-current-user";

import { useAIDrawer } from "@/hooks/use-ai-drawer";

export function AppSidebar() {
  const { data } = useCurrentUser();
  const { toggle } = useAIDrawer();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getVersion) {
      api.getVersion().then((v: string) => setVersion(v)).catch(() => {});
    }
  }, []);
  const isActive = (url: string) =>
    url === "/clients"
      ? path === "/clients" || (path.startsWith("/clients/") && path !== "/clients/new")
      : path === url || path.startsWith(url + "/");

  const baseItems = [
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "AI Assistant", icon: MessageSquareText, onClick: toggle },
    { title: "Clients", url: "/clients", icon: Users },
    { title: "New Client", url: "/clients/new", icon: PlusCircle },
    { title: "Follow-ups", url: "/follow-ups", icon: Bell },
    { title: "Sales KPIs", url: "/metrics", icon: BookOpen },
    { title: "About", url: "/about", icon: Info },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <Activity className="h-5 w-5 text-primary" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold tracking-tight leading-tight">CRAS</span>
            {data?.company?.name && (
              <span className="text-[10px] text-muted-foreground truncate leading-tight">{data.company.name}</span>
            )}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {baseItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.onClick ? (
                    <SidebarMenuButton onClick={item.onClick} className="cursor-pointer">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild isActive={isActive(item.url || "")}>
                      <Link to={item.url || ""}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}

              {/* Calendar — coming soon */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  className="cursor-not-allowed opacity-50"
                  title="Coming soon"
                >
                  <CalendarDays className="h-4 w-4" />
                  <span className="flex items-center gap-2">
                    Calendar
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/15 text-primary leading-none">
                      soon
                    </span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {data?.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={path.startsWith("/admin")}>
                    <Link to="/admin">
                      <Shield className="h-4 w-4" />
                      <span>Admin Panel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        {version && (
          <div className="px-3 py-1 text-[10px] text-muted-foreground/50 text-center">
            v{version}
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={path === "/profile"}>
              <Link to="/profile">
                <UserCircle className="h-4 w-4" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{data?.profile?.name ?? "My Profile"}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{data?.user?.email}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
