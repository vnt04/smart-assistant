import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider } from "./features/auth/AuthContext";
import { ThemeProvider } from "./components/theme/theme-provider";
import { ConfirmDialogProvider } from "./components/ui/confirm-dialog";
import { PasswordPromptProvider } from "./components/ui/password-prompt";
import { router } from "./router";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ConfirmDialogProvider>
            <PasswordPromptProvider>
              <RouterProvider router={router} />
            </PasswordPromptProvider>
          </ConfirmDialogProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
