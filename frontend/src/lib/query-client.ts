import { QueryClient } from "@tanstack/react-query"

import { shouldRetryProjectRequest } from "@/features/studio/project-queries"

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryProjectRequest,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export const queryClient = createQueryClient()
