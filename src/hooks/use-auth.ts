import { useCurrentUser } from "./use-current-user";

export function useAuth() {
  const { data, isLoading } = useCurrentUser();
  return { u: data, isLoading };
}
