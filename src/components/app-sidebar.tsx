import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Users, BarChart3, MessageSquareText, Shield, PlusCircle } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
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
  const isActive = (url: string) =>
    url === "/clients" ? path === "/clients" || path.startsWith("/clients/") && path !== "/clients/new" : path === url;

  const baseItems = [
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "AI Assistant", icon: MessageSquareText, onClick: toggle },
    { title: "Clients", url: "/clients", icon: Users },
    { title: "New Client", url: "/clients/new", icon: PlusCircle },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-bold tracking-tight">CRAS</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {baseItems.map((item, idx) => (
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
    </Sidebar>
  );
}
